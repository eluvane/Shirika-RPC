import { AsyncResource } from 'node:async_hooks';
import type { Worker } from 'node:worker_threads';
import { ShirikaClosedError, ShirikaWorkerCrashedError } from '../core/errors.js';
import type { ContractShape, MethodNames, RequestOf, ResponseOf } from '../core/rpc/contract.js';
import type { RpcCallOptions, RpcClient, RpcClientControl } from '../core/rpc/types.js';
import { createNodeWorkerRpcClient, type NodeWorkerCrashContext, type NodeWorkerRpcClientOptions } from './node-client.js';
export type NodeWorkerPoolWorkerId = number;
export interface NodeWorkerRespawnPolicy {
    readonly enabled?: boolean;
    readonly maxAttempts?: number;
    readonly delayMs?: number;
    readonly backoffFactor?: number;
    readonly maxDelayMs?: number;
    readonly resetAfterMs?: number;
}
export interface NodeWorkerPoolOptions extends NodeWorkerRpcClientOptions {
    readonly size?: number;
    readonly respawnPolicy?: NodeWorkerRespawnPolicy;
    readonly onWorkerCrash?: (workerId: NodeWorkerPoolWorkerId, error: ShirikaWorkerCrashedError) => void;
    readonly onWorkerRespawn?: (workerId: NodeWorkerPoolWorkerId) => void;
}
export interface NodeWorkerPool<C extends ContractShape> extends RpcClient<C> {
    readonly size: number;
}
export type NodeWorkerFactory = () => Worker | Promise<Worker>;
type PoolSlotState = 'bootstrapping' | 'respawning' | 'active' | 'dead' | 'closing';
interface PoolSlot<C extends ContractShape> {
    readonly index: number;
    state: PoolSlotState;
    generation: number;
    busyCount: number;
    worker: Worker | undefined;
    client: RpcClientControl<C> | undefined;
    bootstrapPromise: Promise<void> | undefined;
    respawnPromise: Promise<void> | undefined;
    detachEvents: (() => void) | undefined;
    crashStreak: number;
    lastActivatedAt: number | undefined;
}
interface NormalizedNodeWorkerRespawnPolicy {
    readonly enabled: boolean;
    readonly maxAttempts: number;
    readonly delayMs: number;
    readonly backoffFactor: number;
    readonly maxDelayMs: number;
    readonly resetAfterMs: number;
}
class NodeWorkerPoolImpl<C extends ContractShape> implements NodeWorkerPool<C> {
    readonly #factory: NodeWorkerFactory;
    readonly #contract: C;
    readonly #options: NodeWorkerPoolOptions;
    readonly #slots: PoolSlot<C>[];
    readonly #size: number;
    readonly #respawnPolicy: NormalizedNodeWorkerRespawnPolicy;
    readonly #onWorkerCrash: NodeWorkerPoolOptions['onWorkerCrash'];
    readonly #onWorkerRespawn: NodeWorkerPoolOptions['onWorkerRespawn'];
    #closed = false;
    #closePromise: Promise<void> | undefined;
    constructor(factory: NodeWorkerFactory, contract: C, options: NodeWorkerPoolOptions, size: number) {
        this.#factory = factory;
        this.#contract = contract;
        this.#options = options;
        this.#size = size;
        this.#respawnPolicy = normalizeRespawnPolicy(options.respawnPolicy);
        this.#onWorkerCrash = options.onWorkerCrash;
        this.#onWorkerRespawn = options.onWorkerRespawn;
        this.#slots = Array.from({ length: size }, (_, index) => ({
            index,
            state: 'dead',
            generation: 0,
            busyCount: 0,
            worker: undefined,
            client: undefined,
            bootstrapPromise: undefined,
            respawnPromise: undefined,
            detachEvents: undefined,
            crashStreak: 0,
            lastActivatedAt: undefined,
        }));
    }
    get size(): number {
        return this.#size;
    }
    async bootstrapAll(): Promise<void> {
        await Promise.all(this.#slots.map((slot) => this.bootstrapSlot(slot)));
    }
    call<K extends MethodNames<C>>(method: K, request: RequestOf<C, K>, options?: RpcCallOptions): Promise<ResponseOf<C, K>> {
        return this.runWithSlot((slot) => {
            const client = slot.client;
            if (!client) {
                throw new ShirikaClosedError(`Node worker pool slot ${slot.index} has no active client`);
            }
            return client.call(method, request, options);
        });
    }
    notify<K extends MethodNames<C>>(method: K, request: RequestOf<C, K>, options?: RpcCallOptions): Promise<void> {
        return this.runWithSlot((slot) => {
            const client = slot.client;
            if (!client) {
                throw new ShirikaClosedError(`Node worker pool slot ${slot.index} has no active client`);
            }
            return client.notify(method, request, options);
        });
    }
    async close(): Promise<void> {
        if (this.#closePromise) {
            return this.#closePromise;
        }
        this.#closePromise = (async () => {
            if (this.#closed) {
                return;
            }
            this.#closed = true;
            await Promise.allSettled(this.#slots.map((slot) => this.closeSlot(slot)));
        })();
        return this.#closePromise;
    }
    private async runWithSlot<T>(invoke: (slot: PoolSlot<C>) => Promise<T>): Promise<T> {
        this.assertOpen();
        const resource = new AsyncResource('ShirikaWorkerPoolTask');
        return new Promise<T>((resolve, reject) => {
            void this.acquireSlot().then(
                (slot) => {
                    const settleResolve = (value: T) => {
                        resource.runInAsyncScope(resolve, undefined, value);
                    };
                    const settleReject = (error: unknown) => {
                        resource.runInAsyncScope(reject, undefined, error);
                    };
                    Promise.resolve()
                        .then(() => invoke(slot))
                        .then(settleResolve, settleReject)
                        .finally(() => {
                            slot.busyCount = Math.max(0, slot.busyCount - 1);
                            resource.emitDestroy();
                        });
                },
                (error: unknown) => {
                    resource.runInAsyncScope(reject, undefined, error);
                    resource.emitDestroy();
                },
            );
        });
    }
    private async acquireSlot(): Promise<PoolSlot<C>> {
        while (true) {
            this.assertOpen();
            const slot = this.pickLeastBusySlot();
            if (slot) {
                slot.busyCount += 1;
                return slot;
            }
            const waitables = this.#slots
                .flatMap((candidate) => [candidate.bootstrapPromise, candidate.respawnPromise])
                .filter((promise): promise is Promise<void> => promise !== undefined)
                .map((promise) => promise.catch(() => undefined));
            if (waitables.length === 0) {
                throw new ShirikaClosedError('Node worker pool has no active clients');
            }
            await Promise.race(waitables);
        }
    }
    private pickLeastBusySlot(): PoolSlot<C> | undefined {
        let best: PoolSlot<C> | undefined;
        for (const slot of this.#slots) {
            if (slot.state !== 'active' || !slot.client) {
                continue;
            }
            if (!best || slot.busyCount < best.busyCount || (slot.busyCount === best.busyCount && slot.index < best.index)) {
                best = slot;
            }
        }
        return best;
    }
    private bootstrapSlot(slot: PoolSlot<C>): Promise<void> {
        if (this.#closed) {
            return Promise.reject(new ShirikaClosedError('Node worker pool is closed'));
        }
        if (slot.state === 'active' && slot.client) {
            return Promise.resolve();
        }
        if (slot.bootstrapPromise) {
            return slot.bootstrapPromise;
        }
        const generation = slot.generation + 1;
        slot.generation = generation;
        slot.state = 'bootstrapping';
        slot.bootstrapPromise = (async () => {
            let worker: Worker | undefined;
            let client: RpcClientControl<C> | undefined;
            try {
                worker = await Promise.resolve(this.#factory());
                if (this.#closed || slot.generation !== generation || isClosingSlot(slot)) {
                    await safeTerminate(worker);
                    throw new ShirikaClosedError('Node worker pool closed during bootstrap');
                }
                slot.worker = worker;
                client = await createNodeWorkerRpcClient(worker, this.#contract, this.createClientOptions(slot));
                if (this.#closed || slot.generation !== generation || isClosingSlot(slot)) {
                    await safeAbortClient(client, new ShirikaClosedError('Node worker pool closed during bootstrap'));
                    await safeTerminate(worker);
                    throw new ShirikaClosedError('Node worker pool closed during bootstrap');
                }
                slot.client = client;
                slot.detachEvents = this.attachSlotEvents(slot, generation, worker);
                slot.state = 'active';
                slot.lastActivatedAt = Date.now();
            } catch (error) {
                await this.cleanupSlotResources(slot, error, generation);
                throw error;
            } finally {
                if (slot.generation === generation) {
                    slot.bootstrapPromise = undefined;
                }
            }
        })();
        return slot.bootstrapPromise;
    }
    private createClientOptions(slot: PoolSlot<C>): NodeWorkerRpcClientOptions {
        const {
            size: _size,
            respawnPolicy: _respawnPolicy,
            onWorkerCrash: _onWorkerCrash,
            onWorkerRespawn: _onWorkerRespawn,
            bindWorkerLifecycle: _bindWorkerLifecycle,
            workerCrashErrorFactory: _workerCrashErrorFactory,
            ...clientOptions
        } = this.#options;
        return {
            ...clientOptions,
            bindWorkerLifecycle: false,
            workerCrashErrorFactory: (context) => createPoolWorkerCrashError(slot.index, context),
        };
    }
    private attachSlotEvents(slot: PoolSlot<C>, generation: number, worker: Worker): () => void {
        const onError = (error: Error) => {
            this.handleSlotFailure(
                slot,
                createPoolWorkerCrashError(slot.index, {
                    phase: 'runtime',
                    kind: 'error',
                    worker,
                    error,
                }),
                generation,
            );
        };
        const onExit = (code: number) => {
            this.handleSlotFailure(
                slot,
                createPoolWorkerCrashError(slot.index, {
                    phase: 'runtime',
                    kind: 'exit',
                    worker,
                    exitCode: code,
                }),
                generation,
            );
        };
        worker.on('error', onError);
        worker.on('exit', onExit);
        return () => {
            worker.off('error', onError);
            worker.off('exit', onExit);
        };
    }
    private handleSlotFailure(slot: PoolSlot<C>, error: ShirikaWorkerCrashedError, generation: number): void {
        if (slot.generation !== generation) {
            return;
        }
        if (slot.state === 'closing') {
            return;
        }
        this.invokeWorkerCrashHook(slot.index, error);
        void this.cleanupSlotResources(slot, error, generation).finally(() => {
            this.scheduleRespawn(slot);
        });
    }
    private scheduleRespawn(slot: PoolSlot<C>): void {
        if (this.#closed || slot.state === 'closing') {
            return;
        }
        if (!this.#respawnPolicy.enabled) {
            return;
        }
        if (slot.bootstrapPromise || slot.respawnPromise) {
            return;
        }
        const activatedAt = slot.lastActivatedAt;
        if (activatedAt !== undefined && Date.now() - activatedAt >= this.#respawnPolicy.resetAfterMs) {
            slot.crashStreak = 0;
        }
        slot.lastActivatedAt = undefined;
        slot.crashStreak += 1;
        const attempt = slot.crashStreak;
        if (attempt > this.#respawnPolicy.maxAttempts) {
            slot.state = 'dead';
            return;
        }
        const delayMs = computeRespawnDelay(this.#respawnPolicy, attempt);
        slot.state = 'respawning';
        let retryError: ShirikaWorkerCrashedError | undefined;
        const runRespawn = async (): Promise<void> => {
            await Promise.resolve();
            try {
                if (delayMs > 0) {
                    await sleep(delayMs);
                }
                if (this.#closed || slot.state === 'closing') {
                    return;
                }
                await this.bootstrapSlot(slot);
                this.invokeWorkerRespawnHook(slot.index);
            } catch (caught) {
                if (caught instanceof ShirikaWorkerCrashedError) {
                    retryError = caught;
                    this.invokeWorkerCrashHook(slot.index, caught);
                } else if (!(caught instanceof ShirikaClosedError)) {
                    console.error(`[shirika-rpc] worker pool respawn failed for slot ${slot.index}`, caught);
                }
            } finally {
                if (slot.respawnPromise === respawnPromise) {
                    slot.respawnPromise = undefined;
                }
                if (slot.state === 'respawning' && !slot.client && !slot.bootstrapPromise) {
                    slot.state = 'dead';
                }
            }
            if (retryError) {
                this.scheduleRespawn(slot);
            }
        };
        const respawnPromise = runRespawn();
        slot.respawnPromise = respawnPromise;
    }
    private async closeSlot(slot: PoolSlot<C>): Promise<void> {
        slot.state = 'closing';
        const generation = ++slot.generation;
        const bootstrapPromise = slot.bootstrapPromise;
        const respawnPromise = slot.respawnPromise;
        slot.bootstrapPromise = undefined;
        slot.respawnPromise = undefined;
        await this.cleanupSlotResources(slot, new ShirikaClosedError('Node worker pool closed'), generation, true);
        await Promise.allSettled([bootstrapPromise?.catch(() => undefined), respawnPromise?.catch(() => undefined)]);
        slot.state = 'dead';
    }
    private async cleanupSlotResources(slot: PoolSlot<C>, reason: unknown, generation: number, graceful = false): Promise<void> {
        if (slot.generation !== generation && slot.state !== 'closing') {
            return;
        }
        slot.detachEvents?.();
        slot.detachEvents = undefined;
        const worker = slot.worker;
        const client = slot.client;
        slot.worker = undefined;
        slot.client = undefined;
        if (slot.state !== 'closing') {
            slot.state = this.#closed ? 'closing' : 'dead';
        }
        await Promise.allSettled([graceful ? safeCloseClient(client) : safeAbortClient(client, reason), safeTerminate(worker)]);
    }
    private invokeWorkerCrashHook(workerId: NodeWorkerPoolWorkerId, error: ShirikaWorkerCrashedError): void {
        if (!this.#onWorkerCrash) {
            return;
        }
        try {
            this.#onWorkerCrash(workerId, error);
        } catch (hookError) {
            console.error('[shirika-rpc] onWorkerCrash hook failed', hookError);
        }
    }
    private invokeWorkerRespawnHook(workerId: NodeWorkerPoolWorkerId): void {
        if (!this.#onWorkerRespawn) {
            return;
        }
        try {
            this.#onWorkerRespawn(workerId);
        } catch (hookError) {
            console.error('[shirika-rpc] onWorkerRespawn hook failed', hookError);
        }
    }
    private assertOpen(): void {
        if (this.#closed) {
            throw new ShirikaClosedError('Node worker pool is closed');
        }
    }
}
async function safeAbortClient<C extends ContractShape>(client: RpcClientControl<C> | undefined, reason: unknown): Promise<void> {
    if (!client) {
        return;
    }
    await client.abort(reason).catch(() => undefined);
}
async function safeCloseClient<C extends ContractShape>(client: RpcClientControl<C> | undefined): Promise<void> {
    if (!client) {
        return;
    }
    await client
        .close()
        .catch(() => client.abort(new ShirikaClosedError('Node worker pool closed')))
        .catch(() => undefined);
}
async function safeTerminate(worker: Worker | undefined): Promise<void> {
    if (!worker) {
        return;
    }
    await worker.terminate().catch(() => undefined);
}
function createPoolWorkerCrashError(workerId: NodeWorkerPoolWorkerId, context: NodeWorkerCrashContext): ShirikaWorkerCrashedError {
    const threadId = safeThreadId(context.worker);
    if (context.kind === 'error') {
        const message = `Pool worker ${workerId} crashed during ${context.phase}: ${context.error?.message ?? 'uncaught worker error'}`;
        return new ShirikaWorkerCrashedError(
            message,
            {
                workerId,
                ...(threadId !== undefined ? { threadId } : {}),
                phase: context.phase,
                kind: context.kind,
            },
            context.error instanceof Error ? { cause: context.error } : undefined,
        );
    }
    const suffix = context.exitCode === undefined ? '' : ` with exit code ${context.exitCode}`;
    return new ShirikaWorkerCrashedError(`Pool worker ${workerId} exited during ${context.phase}${suffix}`, {
        workerId,
        ...(threadId !== undefined ? { threadId } : {}),
        phase: context.phase,
        kind: context.kind,
        ...(context.exitCode !== undefined ? { exitCode: context.exitCode } : {}),
    });
}
function safeThreadId(worker: Worker): number | undefined {
    try {
        return typeof worker.threadId === 'number' ? worker.threadId : undefined;
    } catch {
        return undefined;
    }
}
function isClosingSlot<C extends ContractShape>(slot: PoolSlot<C>): boolean {
    return slot.state === 'closing';
}
function normalizeRespawnPolicy(policy: NodeWorkerRespawnPolicy | undefined): NormalizedNodeWorkerRespawnPolicy {
    const enabled = policy?.enabled ?? true;
    const delayMs = normalizeFiniteNonNegative(policy?.delayMs, 0, 'respawnPolicy.delayMs');
    const backoffFactor = normalizeFiniteAtLeast(policy?.backoffFactor, 1, 'respawnPolicy.backoffFactor');
    const maxDelayMs = Math.max(delayMs, normalizeFiniteNonNegative(policy?.maxDelayMs, delayMs, 'respawnPolicy.maxDelayMs'));
    const maxAttempts = normalizeAttempts(policy?.maxAttempts);
    const resetAfterMs = normalizeFiniteNonNegative(policy?.resetAfterMs, 30000, 'respawnPolicy.resetAfterMs');
    return {
        enabled,
        maxAttempts,
        delayMs,
        backoffFactor,
        maxDelayMs,
        resetAfterMs,
    };
}
function normalizeAttempts(value: number | undefined): number {
    if (value === undefined) {
        return Number.POSITIVE_INFINITY;
    }
    if (!Number.isFinite(value)) {
        if (value === Number.POSITIVE_INFINITY) {
            return value;
        }
        throw new TypeError(`respawnPolicy.maxAttempts must be a non-negative integer or Infinity, received ${value}`);
    }
    if (!Number.isInteger(value) || value < 0) {
        throw new TypeError(`respawnPolicy.maxAttempts must be a non-negative integer or Infinity, received ${value}`);
    }
    return value;
}
function normalizeFiniteNonNegative(value: number | undefined, fallback: number, label: string): number {
    const candidate = value ?? fallback;
    if (!Number.isFinite(candidate) || candidate < 0) {
        throw new TypeError(`${label} must be a finite non-negative number, received ${candidate}`);
    }
    return candidate;
}
function normalizeFiniteAtLeast(value: number | undefined, minimum: number, label: string): number {
    const candidate = value ?? minimum;
    if (!Number.isFinite(candidate) || candidate < minimum) {
        throw new TypeError(`${label} must be a finite number >= ${minimum}, received ${candidate}`);
    }
    return candidate;
}
function computeRespawnDelay(policy: NormalizedNodeWorkerRespawnPolicy, attempt: number): number {
    if (policy.delayMs <= 0) {
        return 0;
    }
    const rawDelay = policy.delayMs * policy.backoffFactor ** Math.max(0, attempt - 1);
    if (!Number.isFinite(rawDelay)) {
        return policy.maxDelayMs;
    }
    if (rawDelay <= 0) {
        return 0;
    }
    return Math.min(policy.maxDelayMs, rawDelay);
}
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
export async function createNodeWorkerPool<C extends ContractShape>(
    factory: NodeWorkerFactory,
    contract: C,
    options: NodeWorkerPoolOptions = {},
): Promise<NodeWorkerPool<C>> {
    const size = options.size ?? 1;
    if (!Number.isInteger(size) || size <= 0) {
        throw new TypeError(`Worker pool size must be a positive integer, received ${size}`);
    }
    const pool = new NodeWorkerPoolImpl(factory, contract, options, size);
    try {
        await pool.bootstrapAll();
        return pool;
    } catch (error) {
        await pool.close();
        throw error;
    }
}
