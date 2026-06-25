import { normalizeAbortReason } from '../abort.js';
import type { Codec } from '../codec/types.js';
import { CancelCode, FrameFlag, Opcode, TransportErrorHint } from '../constants.js';
import { ShirikaClosedError, ShirikaProtocolError, ShirikaTimeoutError } from '../errors.js';
import { isFastPathEnabled } from '../fast-path-strategy.js';
import type { DuplexEndpoint, SendFrameOptions } from '../ring/endpoint.js';
import { deadlineFromTimeout, describeError } from '../utils.js';
import { cancelPayloadCodec, createCancelPayload } from './cancel.js';
import {
    type ContractInput,
    type ContractShape,
    type MethodNames,
    type PreparedContract,
    prepareContract,
    type RequestOf,
    type ResponseOf,
} from './contract.js';
import { createDurationStats, type RpcTransportSnapshot, safeInvokeHook, snapshotDurationStats } from './observability.js';
import { PendingRequestStore, type PendingRequestWitness } from './pending.js';
import { createRemoteError, decodeRemoteErrorPayload } from './remote-error.js';
import type { RpcCallOptions, RpcClientControl, RpcTransportOptions } from './types.js';

interface PendingRequest {
    readonly methodName: string;
    readonly methodId: number;
    readonly responseCodec: Codec<unknown>;
    readonly promise: Promise<unknown>;
    readonly resolve: (value: unknown) => void;
    readonly reject: (reason?: unknown) => void;
    timer: ReturnType<typeof setTimeout> | undefined;
    detachAbort: () => void;
    abortSend: (reason?: unknown) => void;
}

interface PendingRegistration {
    readonly requestId: number;
    readonly pending: PendingRequest;
    readonly witness: PendingRequestWitness<PendingRequest> | undefined;
    readonly registered: boolean;
}

interface ReleasedPendingRequest {
    readonly requestId: number;
    readonly pending: PendingRequest;
}

interface CallTiming {
    readonly timeoutMs: number | undefined;
    readonly deadline: number | undefined;
}

interface Deferred<T> {
    readonly promise: Promise<T>;
    readonly resolve: (value: T | PromiseLike<T>) => void;
    readonly reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
    let resolveDeferred: ((value: T | PromiseLike<T>) => void) | undefined;
    let rejectDeferred: ((reason?: unknown) => void) | undefined;
    const promise = new Promise<T>((resolve, reject) => {
        resolveDeferred = resolve;
        rejectDeferred = reject;
    });
    if (resolveDeferred === undefined || rejectDeferred === undefined) {
        throw new ShirikaProtocolError('Promise executor did not initialize deferred callbacks');
    }
    return { promise, resolve: resolveDeferred, reject: rejectDeferred };
}

export class RpcClientImpl<C extends ContractShape> implements RpcClientControl<C> {
    readonly #preparedContract: PreparedContract<C>;
    readonly #endpoint: DuplexEndpoint;
    readonly #defaultCallTimeoutMs: number | undefined;
    readonly #closeTimeoutMs: number;
    readonly #pending = new PendingRequestStore<PendingRequest>();
    readonly #handlerTimeStats = createDurationStats();
    readonly #responseSendTimeStats = createDurationStats();
    readonly #onFatalError;
    #closed = false;
    #closePromise: Promise<void> | undefined;
    #completed = 0;
    #failed = 0;
    #timedOut = 0;
    #cancelled = 0;

    constructor(contract: ContractInput<C>, endpoint: DuplexEndpoint, options: RpcTransportOptions = {}) {
        this.#preparedContract = prepareContract(contract);
        this.#endpoint = endpoint;
        this.#defaultCallTimeoutMs = options.defaultCallTimeoutMs ?? options.defaultTimeoutMs;
        this.#closeTimeoutMs = options.closeTimeoutMs ?? 50;
        this.#onFatalError = options.onFatalError;
        void this.runReceiveLoop();
    }

    get closed(): boolean {
        return this.#closed;
    }

    snapshot(): RpcTransportSnapshot {
        const endpoint = this.#endpoint.snapshot();
        return {
            at: Date.now(),
            role: 'client',
            closed: this.#closed,
            endpoint,
            counters: {
                callsInFlight: this.#pending.size,
                queuedRequests: 0,
                completed: this.#completed,
                failed: this.#failed,
                timedOut: this.#timedOut,
                cancelled: this.#cancelled,
                notifyErrors: 0,
            },
            timings: {
                encodeTimeMs: endpoint.timings.encodeTimeMs,
                queueWaitMs: endpoint.timings.queueWaitMs,
                handlerTimeMs: snapshotDurationStats(this.#handlerTimeStats),
                responseSendTimeMs: snapshotDurationStats(this.#responseSendTimeStats),
            },
            metrics: {
                handlerLatencyByMethod: {},
            },
        };
    }

    call<K extends MethodNames<C>>(method: K, request: RequestOf<C, K>, options: RpcCallOptions = {}): Promise<ResponseOf<C, K>> {
        const closedError = this.getClosedError();
        if (closedError) {
            return Promise.reject(closedError);
        }
        const entry = this.#preparedContract.methodsByName.get(String(method));
        if (!entry) {
            throw new ShirikaProtocolError(`Unknown RPC method ${String(method)}`);
        }
        if (options.signal?.aborted) {
            const reason = normalizeAbortReason(options.signal.reason, `RPC call '${String(method)}' was aborted`);
            this.recordTerminalReason(reason);
            return Promise.reject(reason);
        }
        const timing = resolveCallTiming(options.timeoutMs, this.#defaultCallTimeoutMs);
        const requestId = this.allocateRequestId();
        const sendController = new AbortController();
        const def = entry.def;
        const registration = this.createPendingRequest(
            requestId,
            String(method),
            entry.id,
            def.response as Codec<unknown>,
            timing,
            options.signal,
            (reason) => {
                sendController.abort(reason);
            },
        );
        if (!registration.registered) {
            return registration.pending.promise as Promise<ResponseOf<C, K>>;
        }
        const sendOptions = createRequestSendOptions(timing, sendController.signal);
        void this.#endpoint.send(Opcode.REQUEST, requestId, entry.id, def.request, request, sendOptions).catch((error: unknown) => {
            this.rejectPendingRegistration(registration, error);
        });
        return registration.pending.promise as Promise<ResponseOf<C, K>>;
    }

    notify<K extends MethodNames<C>>(method: K, request: RequestOf<C, K>, options: RpcCallOptions = {}): Promise<void> {
        const closedError = this.getClosedError();
        if (closedError) {
            return Promise.reject(closedError);
        }
        const entry = this.#preparedContract.methodsByName.get(String(method));
        if (!entry) {
            throw new ShirikaProtocolError(`Unknown RPC method ${String(method)}`);
        }
        if (options.signal?.aborted) {
            return Promise.reject(normalizeAbortReason(options.signal.reason, `RPC notify '${String(method)}' was aborted`));
        }
        const def = entry.def;
        const timing = resolveCallTiming(options.timeoutMs, this.#defaultCallTimeoutMs);
        return this.#endpoint.send(Opcode.NOTIFY, 0, entry.id, def.request, request, createRequestSendOptions(timing, options.signal));
    }

    async close(): Promise<void> {
        return this.shutdown(new ShirikaClosedError('RPC client closed'), true);
    }

    async abort(reason?: unknown): Promise<void> {
        return this.shutdown(reason ?? new ShirikaClosedError('RPC client aborted'), false);
    }

    private async shutdown(reason: unknown, sendClose: boolean): Promise<void> {
        if (this.#closePromise) {
            return this.#closePromise;
        }
        this.#closePromise = (async () => {
            if (this.#closed) {
                return;
            }
            this.#closed = true;
            if (sendClose) {
                await this.#endpoint.bestEffortClose(this.#closeTimeoutMs);
            } else if (reason instanceof ShirikaProtocolError) {
                this.#endpoint.markErrored(TransportErrorHint.PROTOCOL);
            } else {
                this.#endpoint.forceClose(TransportErrorHint.CLOSED);
            }
            if (isFastPathEnabled('pendingRequestWitness')) {
                for (const witness of this.#pending.witnessesSnapshot()) {
                    this.rejectPendingByWitness(witness, reason);
                }
            } else {
                for (const release of this.#pending.entriesSnapshot()) {
                    this.rejectPendingKnownEntry(release.requestId, release.entry, reason);
                }
            }
        })();
        return this.#closePromise;
    }

    private getClosedError(): ShirikaClosedError | undefined {
        return this.#closed ? new ShirikaClosedError('RPC client is closed') : undefined;
    }

    private allocateRequestId(): number {
        return this.#pending.allocateRequestId();
    }

    private createPendingRequest(
        requestId: number,
        methodName: string,
        methodId: number,
        responseCodec: Codec<unknown>,
        timing: CallTiming,
        signal: AbortSignal | undefined,
        abortSend: (reason?: unknown) => void,
    ): PendingRegistration {
        const deferred = createDeferred<unknown>();
        const pending: PendingRequest = {
            methodName,
            methodId,
            responseCodec,
            promise: deferred.promise,
            resolve: deferred.resolve,
            reject: deferred.reject,
            timer: undefined,
            detachAbort: () => undefined,
            abortSend,
        };
        if (signal?.aborted) {
            const reason = normalizeAbortReason(signal.reason, `RPC call '${methodName}' was aborted`);
            abortSend(signal.reason);
            this.recordTerminalReason(reason);
            deferred.reject(reason);
            return { requestId, pending, witness: undefined, registered: false };
        }
        const witness = isFastPathEnabled('pendingRequestWitness') ? this.#pending.insertAllocated(requestId, pending) : undefined;
        if (witness === undefined) {
            this.#pending.insertAllocatedWithoutWitness(requestId, pending);
        }
        const registration: PendingRegistration = { requestId, pending, witness, registered: true };
        if (timing.timeoutMs !== undefined) {
            pending.timer = setTimeout(() => {
                this.rejectPendingRegistration(
                    registration,
                    new ShirikaTimeoutError(`RPC call '${methodName}' timed out after ${timing.timeoutMs}ms`),
                    CancelCode.TIMEOUT,
                );
            }, timing.timeoutMs);
        }
        if (signal) {
            const onAbort = () => {
                this.rejectPendingRegistration(
                    registration,
                    normalizeAbortReason(signal.reason, `RPC call '${methodName}' was aborted`),
                    CancelCode.CLIENT_ABORT,
                );
            };
            signal.addEventListener('abort', onAbort, { once: true });
            pending.detachAbort = () => {
                signal.removeEventListener('abort', onAbort);
            };
            if (signal.aborted) {
                onAbort();
            }
        }
        return registration;
    }

    private cleanupPending(pending: PendingRequest): void {
        if (pending.timer !== undefined) {
            clearTimeout(pending.timer);
        }
        pending.detachAbort();
    }

    private lookupPendingFromInbound(requestId: number): ReleasedPendingRequest | undefined {
        const release = this.#pending.lookupUntrusted(requestId);
        if (release === undefined) {
            return undefined;
        }
        return { requestId: release.requestId, pending: release.entry };
    }

    private releasePendingFromInbound(requestId: number): ReleasedPendingRequest | undefined {
        const release = this.#pending.releaseUntrusted(requestId);
        if (release === undefined) {
            return undefined;
        }
        this.cleanupPending(release.entry);
        return { requestId: release.requestId, pending: release.entry };
    }

    private releasePendingByWitness(witness: PendingRequestWitness<PendingRequest>): ReleasedPendingRequest | undefined {
        const release = this.#pending.releaseByWitness(witness);
        if (release === undefined) {
            return undefined;
        }
        this.cleanupPending(release.entry);
        return { requestId: release.requestId, pending: release.entry };
    }

    private releasePendingKnownEntry(requestId: number, pending: PendingRequest): ReleasedPendingRequest | undefined {
        const release = this.#pending.releaseKnownEntry(requestId, pending);
        if (release === undefined) {
            return undefined;
        }
        this.cleanupPending(release.entry);
        return { requestId: release.requestId, pending: release.entry };
    }

    private rejectPendingByWitness(witness: PendingRequestWitness<PendingRequest>, reason: unknown, cancelCode?: CancelCode): void {
        this.rejectReleasedPending(this.releasePendingByWitness(witness), reason, cancelCode);
    }

    private rejectPendingKnownEntry(requestId: number, pending: PendingRequest, reason: unknown, cancelCode?: CancelCode): void {
        this.rejectReleasedPending(this.releasePendingKnownEntry(requestId, pending), reason, cancelCode);
    }

    private rejectPendingRegistration(registration: PendingRegistration, reason: unknown, cancelCode?: CancelCode): void {
        if (registration.witness !== undefined && isFastPathEnabled('pendingRequestWitness')) {
            this.rejectPendingByWitness(registration.witness, reason, cancelCode);
            return;
        }
        this.rejectPendingKnownEntry(registration.requestId, registration.pending, reason, cancelCode);
    }

    private rejectReleasedPending(release: ReleasedPendingRequest | undefined, reason: unknown, cancelCode: CancelCode | undefined): void {
        if (release === undefined) {
            return;
        }
        const pending = release.pending;
        pending.abortSend(reason);
        this.recordTerminalReason(reason);
        pending.reject(reason);
        if (cancelCode !== undefined) {
            this.sendCancel(release.requestId, pending.methodId, cancelCode, reason);
        }
    }

    private recordTerminalReason(reason: unknown): void {
        switch (classifyTerminalReason(reason)) {
            case 'timed-out':
                this.#timedOut += 1;
                break;
            case 'cancelled':
                this.#cancelled += 1;
                break;
            default:
                this.#failed += 1;
                break;
        }
    }

    private sendCancel(requestId: number, methodId: number, cancelCode: CancelCode, reason: unknown): void {
        if (this.#closed) {
            return;
        }
        void this.#endpoint
            .send(Opcode.CANCEL, requestId, methodId, cancelPayloadCodec, createCancelPayload(cancelCode, reason), { timeoutMs: this.#closeTimeoutMs })
            .catch(() => undefined);
    }

    private reportFatalError(error: unknown, phase: 'receive-loop' | 'shutdown' | 'adapter' = 'receive-loop'): void {
        let snapshot: RpcTransportSnapshot;
        try {
            snapshot = this.snapshot();
        } catch {
            return;
        }
        safeInvokeHook(
            this.#onFatalError,
            {
                at: Date.now(),
                role: 'client',
                phase,
                error,
                snapshot,
            },
            'onFatalError',
        );
    }

    private async runReceiveLoop(): Promise<void> {
        while (!this.#closed) {
            try {
                const frame = await this.#endpoint.receive();
                switch (frame.header.opcode) {
                    case Opcode.RESPONSE_OK: {
                        const match = this.lookupPendingFromInbound(frame.header.requestId);
                        if (match === undefined) {
                            frame.discard();
                            break;
                        }
                        const value = frame.readWithCodec(match.pending.responseCodec);
                        const release = this.releasePendingFromInbound(frame.header.requestId);
                        if (release === undefined) {
                            break;
                        }
                        this.#completed += 1;
                        release.pending.resolve(value);
                        break;
                    }
                    case Opcode.RESPONSE_ERR: {
                        const match = this.lookupPendingFromInbound(frame.header.requestId);
                        if (match === undefined) {
                            frame.discard();
                            break;
                        }
                        const errorPayload = decodeRemoteErrorPayload(frame.readPayloadBytes());
                        const release = this.releasePendingFromInbound(frame.header.requestId);
                        if (release === undefined) {
                            break;
                        }
                        const error = createRemoteError(errorPayload, frame.header.statusCode);
                        this.recordTerminalReason(error);
                        release.pending.reject(error);
                        break;
                    }
                    case Opcode.CLOSE:
                        frame.discard();
                        await this.abort(new ShirikaClosedError('Peer closed RPC connection'));
                        return;
                    default:
                        frame.discard();
                        throw new ShirikaProtocolError(`Unexpected opcode ${frame.header.opcode} received by RPC client`);
                }
            } catch (error) {
                if (this.#closed) {
                    return;
                }
                this.reportFatalError(error, 'receive-loop');
                await this.abort(error instanceof Error ? error : new Error(describeError(error)));
                return;
            }
        }
    }
}

function resolveCallTiming(timeoutMs: number | undefined, defaultTimeoutMs: number | undefined): CallTiming {
    const effectiveTimeoutMs = timeoutMs ?? defaultTimeoutMs;
    return {
        timeoutMs: effectiveTimeoutMs,
        deadline: deadlineFromTimeout(effectiveTimeoutMs),
    };
}

function createRequestSendOptions(timing: CallTiming, signal: AbortSignal | undefined): SendFrameOptions {
    return {
        ...(signal !== undefined ? { signal } : {}),
        ...(timing.timeoutMs !== undefined ? { timeoutMs: timing.timeoutMs } : {}),
        ...(timing.deadline !== undefined ? { deadline: timing.deadline, flags: FrameFlag.HAS_DEADLINE } : {}),
    };
}

function classifyTerminalReason(reason: unknown): 'timed-out' | 'cancelled' | 'failed' {
    if (reason instanceof ShirikaTimeoutError) {
        return 'timed-out';
    }
    if (reason instanceof ShirikaClosedError || isAbortLike(reason)) {
        return 'cancelled';
    }
    return 'failed';
}

function isAbortLike(reason: unknown): boolean {
    return reason instanceof DOMException ? reason.name === 'AbortError' : reason instanceof Error ? reason.name === 'AbortError' : false;
}

export function createRpcClient<C extends ContractShape>(
    contract: ContractInput<C>,
    endpoint: DuplexEndpoint,
    options?: RpcTransportOptions,
): RpcClientImpl<C> {
    return new RpcClientImpl(contract, endpoint, options);
}
