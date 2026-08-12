import { ByteArrayBinaryReader } from '../codec/byte-array-reader.js';
import type { Codec } from '../codec/types.js';
import { FrameFlag, Opcode, TransportErrorHint } from '../constants.js';
import { ShirikaClosedError, ShirikaOverloadError, ShirikaOversizeError, ShirikaProtocolError, ShirikaTimeoutError } from '../errors.js';
import type { DuplexEndpoint, FrameHeader, FrameReadView, SendFrameOptions } from '../ring/endpoint.js';
import { classifyTerminalReason, deadlineFromTimeout, describeError, remainingTimeout } from '../utils.js';
import { cancelPayloadCodec, createCancelReason } from './cancel.js';
import { type ContractInput, type ContractShape, type MethodNames, type PreparedContract, prepareContract, type RequestOf } from './contract.js';
import {
    createDurationStats,
    createMethodLatencyMetrics,
    invokeFatalErrorHook,
    nowMs,
    type RpcNotifyErrorPolicy,
    recordDuration,
    recordMethodLatency,
    safeInvokeHook,
    snapshotMethodLatencyMetrics,
    snapshotRpcTransport,
} from './observability.js';
import { remoteErrorCodec, toRemoteErrorPayload } from './remote-error.js';
import type { RpcHandlerContext, RpcHandlers, RpcOverloadPolicy, RpcServer, RpcTransportOptions } from './types.js';

class BufferedFrameView {
    readonly header: FrameHeader;
    readonly payloadLength: number;
    readonly frameSize: number;
    readonly #payload: Uint8Array;
    constructor(header: FrameHeader, payload: Uint8Array) {
        this.header = header;
        this.payloadLength = payload.byteLength;
        this.frameSize = payload.byteLength;
        this.#payload = payload;
    }
    static fromFrame(frame: FrameReadView): BufferedFrameView {
        return new BufferedFrameView(frame.header, frame.readPayloadBytes());
    }
    readWithCodec<T>(codec: Codec<T>): T {
        if (codec.kind === 'binary') {
            const reader = new ByteArrayBinaryReader(this.#payload);
            const value = codec.read(reader);
            reader.assertFullyRead();
            return value;
        }
        return codec.decode(this.readPayloadBytes());
    }
    readPayloadBytes(): Uint8Array {
        return this.#payload.slice();
    }
    discard(): void {
        return;
    }
}
interface QueuedFrame {
    readonly frame: BufferedFrameView;
    readonly kind: 'request' | 'notify';
    readonly deadline: number | undefined;
}
type ReceivedFrame = FrameReadView | BufferedFrameView;
interface ActiveInvocation {
    readonly requestId: number;
    readonly kind: 'request' | 'notify';
    readonly controller: AbortController;
    readonly deadline: number | undefined;
}
type SendReplyOutcome = 'sent' | 'timed-out';
type TerminalOutcome = 'failed' | 'timed-out' | 'cancelled';
export class RpcServerImpl<C extends ContractShape> implements RpcServer<C> {
    readonly #handlers: RpcHandlers<C>;
    readonly #endpoint: DuplexEndpoint;
    readonly #preparedContract: PreparedContract<C>;
    readonly #defaultResponseTimeoutMs: number | undefined;
    readonly #closeTimeoutMs: number;
    readonly #maxInFlight: number;
    readonly #maxQueuedRequests: number;
    readonly #overloadPolicy: RpcOverloadPolicy;
    readonly #handlerTimeStats = createDurationStats();
    readonly #handlerLatencyByMethod = new Map<string, ReturnType<typeof createMethodLatencyMetrics>>();
    readonly #responseSendTimeStats = createDurationStats();
    readonly #onFatalError: RpcTransportOptions['onFatalError'];
    readonly #onNotifyError: RpcTransportOptions['onNotifyError'];
    readonly #notifyErrorPolicy: RpcNotifyErrorPolicy;
    readonly #inFlight = new Set<Promise<void>>();
    readonly #activeInvocations = new Set<ActiveInvocation>();
    readonly #requestInvocations = new Map<number, ActiveInvocation>();
    readonly #pendingQueue: QueuedFrame[] = [];
    #closed = false;
    #servePromise?: Promise<void>;
    #closePromise?: Promise<void>;
    #completed = 0;
    #failed = 0;
    #timedOut = 0;
    #cancelled = 0;
    #notifyErrors = 0;
    constructor(contract: ContractInput<C>, handlers: RpcHandlers<C>, endpoint: DuplexEndpoint, options: RpcTransportOptions = {}) {
        this.#preparedContract = prepareContract(contract);
        this.#handlers = handlers;
        this.#endpoint = endpoint;
        this.#defaultResponseTimeoutMs = options.defaultResponseTimeoutMs ?? options.defaultTimeoutMs;
        this.#closeTimeoutMs = options.closeTimeoutMs ?? 50;
        this.#maxInFlight = normalizeInteger(options.maxInFlight, Number.POSITIVE_INFINITY, 'maxInFlight', 1, 'positive');
        this.#maxQueuedRequests = normalizeInteger(options.maxQueuedRequests, Number.POSITIVE_INFINITY, 'maxQueuedRequests', 0, 'non-negative');
        this.#overloadPolicy = options.overloadPolicy ?? 'queue';
        this.#onFatalError = options.onFatalError;
        this.#onNotifyError = options.onNotifyError;
        this.#notifyErrorPolicy = options.notifyErrorPolicy ?? 'log';
        if (this.#notifyErrorPolicy === 'callback' && !this.#onNotifyError) {
            throw new TypeError('notifyErrorPolicy="callback" requires onNotifyError');
        }
    }
    snapshot() {
        return snapshotRpcTransport({
            role: 'server',
            closed: this.#closed,
            endpoint: this.#endpoint.snapshot(),
            counters: {
                callsInFlight: this.#requestInvocations.size,
                queuedRequests: this.#pendingQueue.length,
                completed: this.#completed,
                failed: this.#failed,
                timedOut: this.#timedOut,
                cancelled: this.#cancelled,
                notifyErrors: this.#notifyErrors,
            },
            handlerTimeStats: this.#handlerTimeStats,
            responseSendTimeStats: this.#responseSendTimeStats,
            metrics: {
                handlerLatencyByMethod: Object.fromEntries(
                    [...this.#handlerLatencyByMethod].map(([methodName, metrics]) => [methodName, snapshotMethodLatencyMetrics(metrics)]),
                ),
            },
        });
    }
    async serve(): Promise<void> {
        if (this.#servePromise) {
            return this.#servePromise;
        }
        this.#servePromise = this.runServeLoop();
        return this.#servePromise;
    }
    async close(reason?: unknown): Promise<void> {
        return this.shutdown(reason ?? new ShirikaClosedError('RPC server closed'), true);
    }
    private async shutdown(reason: unknown, sendClose: boolean, skipAwaitTask?: Promise<void>): Promise<void> {
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
            for (const queued of this.#pendingQueue.splice(0)) {
                if (queued.kind === 'request') {
                    this.recordRequestOutcome(classifyTerminalReason(reason));
                }
                queued.frame.discard();
            }
            for (const invocation of this.#activeInvocations) {
                invocation.controller.abort(reason);
            }
            const tasksToAwait = skipAwaitTask === undefined ? [...this.#inFlight] : [...this.#inFlight].filter((task) => task !== skipAwaitTask);
            await Promise.allSettled(tasksToAwait);
        })();
        return this.#closePromise;
    }
    private async runServeLoop(): Promise<void> {
        try {
            while (!this.#closed) {
                const frame = await this.#endpoint.receive();
                switch (frame.header.opcode) {
                    case Opcode.REQUEST:
                        await this.dispatchFrame(frame, 'request');
                        break;
                    case Opcode.NOTIFY:
                        await this.dispatchFrame(frame, 'notify');
                        break;
                    case Opcode.CANCEL:
                        this.handleCancel(frame);
                        break;
                    case Opcode.CLOSE:
                        frame.discard();
                        await this.shutdown(new ShirikaClosedError('Peer closed RPC server connection'), false);
                        return;
                    default:
                        frame.discard();
                        throw new ShirikaProtocolError(`Unexpected opcode ${frame.header.opcode} received by RPC server`);
                }
            }
        } catch (error) {
            if (!this.#closed) {
                invokeFatalErrorHook(this.#onFatalError, 'server', 'serve-loop', error, () => this.snapshot());
                await this.shutdown(error instanceof Error ? error : new Error(describeError(error)), false);
            }
            if (error instanceof ShirikaClosedError && this.#closed) {
                return;
            }
            throw error;
        }
    }
    private async dispatchFrame(frame: FrameReadView, kind: 'request' | 'notify'): Promise<void> {
        if (this.#closed) {
            frame.discard();
            return;
        }
        const deadline = (frame.header.flags & FrameFlag.HAS_DEADLINE) === 0 ? undefined : Date.now() + frame.header.reserved;
        if (this.#inFlight.size < this.#maxInFlight) {
            this.startInvocation(frame, kind, deadline);
            return;
        }
        if (kind === 'request' && this.#overloadPolicy === 'queue' && this.#pendingQueue.length < this.#maxQueuedRequests) {
            this.#pendingQueue.push({ frame: BufferedFrameView.fromFrame(frame), kind, deadline });
            return;
        }
        const requestId = frame.header.requestId;
        const methodId = frame.header.methodId;
        frame.discard();
        const error = new ShirikaOverloadError('RPC server overloaded', {
            maxInFlight: this.#maxInFlight,
            queuedRequests: this.#pendingQueue.length,
            maxQueuedRequests: this.#maxQueuedRequests,
            overloadPolicy: this.#overloadPolicy,
        });
        if (kind === 'request') {
            this.recordRequestOutcome(await this.sendErrorResponse(requestId, methodId, error, deadline));
            return;
        }
        this.handleNotifyFailure(undefined, methodId, requestId, error);
    }
    private startInvocation(frame: ReceivedFrame, kind: 'request' | 'notify', deadline: number | undefined): void {
        const invocation: ActiveInvocation = {
            requestId: frame.header.requestId,
            kind,
            controller: new AbortController(),
            deadline,
        };
        const task = this.handleFrame(frame, kind, invocation)
            .catch(async (error: unknown) => {
                if (!this.#closed) {
                    invokeFatalErrorHook(this.#onFatalError, 'server', 'handler', error, () => this.snapshot());
                    await this.shutdown(error instanceof Error ? error : new Error(describeError(error)), false, task);
                }
            })
            .finally(() => {
                this.#inFlight.delete(task);
                this.#activeInvocations.delete(invocation);
                if (kind === 'request') {
                    this.#requestInvocations.delete(invocation.requestId);
                }
                this.drainQueue();
            });
        this.#inFlight.add(task);
        this.#activeInvocations.add(invocation);
        if (kind === 'request') {
            this.#requestInvocations.set(invocation.requestId, invocation);
        }
    }
    private drainQueue(): void {
        while (!this.#closed && this.#inFlight.size < this.#maxInFlight) {
            const next = this.#pendingQueue.shift();
            if (!next) {
                return;
            }
            this.startInvocation(next.frame, next.kind, next.deadline);
        }
    }
    private handleCancel(frame: FrameReadView): void {
        const payload = frame.readWithCodec(cancelPayloadCodec);
        const reason = createCancelReason(payload);
        const requestId = frame.header.requestId;
        if (this.cancelQueuedRequest(requestId, reason)) {
            return;
        }
        const invocation = this.#requestInvocations.get(requestId);
        if (!invocation) {
            return;
        }
        invocation.controller.abort(reason);
    }
    private cancelQueuedRequest(requestId: number, reason: unknown): boolean {
        const index = this.#pendingQueue.findIndex((entry) => entry.kind === 'request' && entry.frame.header.requestId === requestId);
        if (index < 0) {
            return false;
        }
        const [queued] = this.#pendingQueue.splice(index, 1);
        this.recordRequestOutcome(classifyTerminalReason(reason));
        queued?.frame.discard();
        return true;
    }
    private async handleFrame(frame: ReceivedFrame, kind: 'request' | 'notify', invocation: ActiveInvocation): Promise<void> {
        const entry = this.#preparedContract.methodIndex.get(frame.header.methodId);
        if (!entry) {
            frame.discard();
            const error = Object.assign(new Error(`Unknown method id ${frame.header.methodId}`), {
                name: 'ShirikaMethodNotFoundError',
                code: 'SHIRIKA_RPC_METHOD_NOT_FOUND',
                statusCode: 404,
                data: { methodId: frame.header.methodId },
            });
            await this.failInvocation(kind, invocation, frame.header.requestId, frame.header.methodId, undefined, error);
            return;
        }
        const methodName = entry.method;
        const def = entry.def;
        const handler = this.#handlers[methodName] as (request: RequestOf<C, MethodNames<C>>, ctx: RpcHandlerContext<C, MethodNames<C>>) => unknown;
        const request = frame.readWithCodec(def.request) as RequestOf<C, MethodNames<C>>;
        const handlerStartedAt = nowMs();
        let response: unknown;
        try {
            response = await handler(request, {
                requestId: frame.header.requestId,
                method: methodName,
                kind,
                signal: invocation.controller.signal,
                deadline: invocation.deadline,
            });
        } catch (error) {
            this.recordHandlerLatency(String(methodName), kind, nowMs() - handlerStartedAt);
            await this.failInvocation(kind, invocation, frame.header.requestId, def.id, String(methodName), error);
            return;
        }
        this.recordHandlerLatency(String(methodName), kind, nowMs() - handlerStartedAt);
        if (kind !== 'request') {
            return;
        }
        this.recordRequestOutcome(
            shouldReply(invocation)
                ? await this.sendOkResponse(frame.header.requestId, def.id, def.response, response, invocation.deadline)
                : classifySuppressedRequest(invocation),
        );
    }
    private async failInvocation(
        kind: 'request' | 'notify',
        invocation: ActiveInvocation,
        requestId: number,
        methodId: number,
        methodName: string | undefined,
        error: unknown,
    ): Promise<void> {
        if (kind !== 'request') {
            this.handleNotifyFailure(methodName, methodId, requestId, error);
            return;
        }
        this.recordRequestOutcome(
            shouldReply(invocation) ? await this.sendErrorResponse(requestId, methodId, error, invocation.deadline) : classifySuppressedRequest(invocation),
        );
    }
    private recordHandlerLatency(methodName: string, kind: 'request' | 'notify', durationMs: number): void {
        recordDuration(this.#handlerTimeStats, durationMs);
        const metrics = this.#handlerLatencyByMethod.get(methodName) ?? createMethodLatencyMetrics();
        this.#handlerLatencyByMethod.set(methodName, metrics);
        recordMethodLatency(metrics, durationMs, kind);
    }
    private handleNotifyFailure(methodName: string | undefined, methodId: number, requestId: number, error: unknown): void {
        this.#notifyErrors += 1;
        const event = {
            at: Date.now(),
            methodName,
            methodId,
            requestId,
            error,
            snapshot: this.snapshot(),
        };
        safeInvokeHook(this.#onNotifyError, event, 'onNotifyError');
        if (this.#notifyErrorPolicy === 'callback') {
            return;
        }
        if (this.#notifyErrorPolicy === 'throw') {
            throw error instanceof Error ? error : new Error(describeError(error));
        }
        console.error(`[shirika-rpc] notify handler failed for ${methodName ?? `method#${methodId}`}`, error);
    }
    private async sendReply(send: () => Promise<void>): Promise<SendReplyOutcome> {
        const startedAt = nowMs();
        try {
            await send();
            return 'sent';
        } catch (error) {
            if (error instanceof ShirikaTimeoutError) {
                return 'timed-out';
            }
            throw error;
        } finally {
            recordDuration(this.#responseSendTimeStats, nowMs() - startedAt);
        }
    }
    private async sendOkResponse<T>(
        requestId: number,
        methodId: number,
        codec: C[MethodNames<C>]['response'],
        response: T,
        deadline: number | undefined,
    ): Promise<SendReplyOutcome> {
        const timing = resolveResponseTiming(deadline, this.#defaultResponseTimeoutMs);
        if (timing.timeoutMs !== undefined && timing.timeoutMs <= 0) {
            return 'timed-out';
        }
        return this.sendReply(() =>
            this.#endpoint.send(Opcode.RESPONSE_OK, requestId, methodId, codec, response, createSendOptions(timing.timeoutMs, timing.deadline)),
        );
    }
    private async sendErrorResponse(requestId: number, methodId: number, error: unknown, deadline: number | undefined): Promise<SendReplyOutcome> {
        const timing = resolveResponseTiming(deadline, this.#defaultResponseTimeoutMs);
        if (timing.timeoutMs !== undefined && timing.timeoutMs <= 0) {
            return 'timed-out';
        }
        const basePayload = toRemoteErrorPayload(error);
        const statusCode = resolveErrorStatusCode(error, basePayload.code);
        return this.sendReply(async () => {
            for (const payload of createRemoteErrorPayloadAttempts(basePayload)) {
                try {
                    await this.#endpoint.send(
                        Opcode.RESPONSE_ERR,
                        requestId,
                        methodId,
                        remoteErrorCodec,
                        payload,
                        createSendOptions(timing.timeoutMs, timing.deadline, statusCode),
                    );
                    return;
                } catch (sendError) {
                    if (sendError instanceof ShirikaTimeoutError || !(sendError instanceof ShirikaOversizeError)) {
                        throw sendError;
                    }
                }
            }
            throw new ShirikaOversizeError('Remote error response does not fit into the transport ring');
        });
    }
    private recordRequestOutcome(outcome: SendReplyOutcome | TerminalOutcome): void {
        switch (outcome) {
            case 'sent':
                this.#completed += 1;
                return;
            case 'failed':
                this.#failed += 1;
                return;
            case 'timed-out':
                this.#timedOut += 1;
                return;
            case 'cancelled':
                this.#cancelled += 1;
                return;
            default:
                this.#failed += 1;
        }
    }
}
function shouldReply(invocation: ActiveInvocation): boolean {
    return !invocation.controller.signal.aborted && (invocation.deadline === undefined || invocation.deadline > Date.now());
}
function classifySuppressedRequest(invocation: ActiveInvocation): TerminalOutcome {
    const reason: unknown = invocation.controller.signal.reason;
    if (reason !== undefined) {
        return classifyTerminalReason(reason);
    }
    if (invocation.deadline !== undefined && invocation.deadline <= Date.now()) {
        return 'timed-out';
    }
    return 'cancelled';
}
function resolveResponseTiming(
    deadline: number | undefined,
    defaultTimeoutMs: number | undefined,
): {
    timeoutMs: number | undefined;
    deadline: number | undefined;
} {
    if (deadline !== undefined) {
        return {
            timeoutMs: Math.max(0, remainingTimeout(deadline) ?? 0),
            deadline,
        };
    }
    return {
        timeoutMs: defaultTimeoutMs,
        deadline: deadlineFromTimeout(defaultTimeoutMs),
    };
}
function createSendOptions(timeoutMs: number | undefined, deadline: number | undefined, statusCode?: number): SendFrameOptions {
    return {
        ...(timeoutMs !== undefined ? { timeoutMs } : {}),
        ...(deadline !== undefined ? { deadline } : {}),
        ...(statusCode !== undefined ? { statusCode } : {}),
    };
}
function resolveErrorStatusCode(error: unknown, fallbackCode: string | number | undefined): number | undefined {
    const withStatus = error as
        | {
              statusCode?: number;
          }
        | undefined;
    if (typeof withStatus?.statusCode === 'number' && Number.isInteger(withStatus.statusCode) && withStatus.statusCode > 0) {
        return withStatus.statusCode;
    }
    if (typeof fallbackCode === 'number' && Number.isInteger(fallbackCode) && fallbackCode > 0) {
        return fallbackCode;
    }
    return undefined;
}
function normalizeInteger(value: number | undefined, fallback: number, label: string, minimum: number, kind: 'positive' | 'non-negative'): number {
    if (value === undefined) {
        return fallback;
    }
    if (!Number.isInteger(value) || value < minimum) {
        throw new TypeError(`${label} must be a ${kind} integer, received ${value}`);
    }
    return value;
}
function createRemoteErrorPayloadAttempts(payload: ReturnType<typeof toRemoteErrorPayload>): ReturnType<typeof toRemoteErrorPayload>[] {
    const withCode = payload.code !== undefined ? ({ code: payload.code } as const) : {};
    const base = { name: payload.name, message: payload.message, ...withCode };
    const candidates: Array<ReturnType<typeof toRemoteErrorPayload> | undefined> = [
        payload,
        payload.stack !== undefined ? { ...base, ...(payload.data !== undefined ? { data: payload.data } : {}) } : undefined,
        payload.data !== undefined || payload.stack !== undefined ? base : undefined,
        { ...base, message: truncateRemoteErrorMessage(payload.message, 256) },
        { ...base, message: truncateRemoteErrorMessage(payload.message, 128) },
        { name: 'Error', message: truncateRemoteErrorMessage(payload.message, 64), ...withCode },
    ];
    const attempts: ReturnType<typeof toRemoteErrorPayload>[] = [];
    for (const candidate of candidates) {
        if (candidate === undefined) {
            continue;
        }
        const previous = attempts.at(-1);
        if (previous && JSON.stringify(previous) === JSON.stringify(candidate)) {
            continue;
        }
        attempts.push(candidate);
    }
    return attempts;
}
function truncateRemoteErrorMessage(message: string, maxLength: number): string {
    return message.length <= maxLength ? message : `${message.slice(0, Math.max(0, maxLength - 1))}…`;
}
export function createRpcServer<C extends ContractShape>(
    contract: ContractInput<C>,
    handlers: RpcHandlers<C>,
    endpoint: DuplexEndpoint,
    options?: RpcTransportOptions,
): RpcServerImpl<C> {
    return new RpcServerImpl(contract, handlers, endpoint, options);
}
