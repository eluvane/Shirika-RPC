import type { BinaryReader, Codec } from '../codec/types.js';
import { FrameFlag, Opcode, TransportErrorHint } from '../constants.js';
import { ShirikaClosedError, ShirikaOverloadError, ShirikaOversizeError, ShirikaProtocolError, ShirikaTimeoutError } from '../errors.js';
import type { DuplexEndpoint, FrameHeader, FrameReadView, SendFrameOptions } from '../ring/endpoint.js';
import { decodeUtf8 } from '../utf8.js';
import { deadlineFromTimeout, describeError, remainingTimeout } from '../utils.js';
import { cancelPayloadCodec, createCancelReason } from './cancel.js';
import { type ContractInput, type ContractShape, type MethodNames, type PreparedContract, prepareContract, type RequestOf } from './contract.js';
import {
    createDurationStats,
    createMethodLatencyMetrics,
    nowMs,
    type RpcNotifyErrorPolicy,
    type RpcTransportSnapshot,
    recordDuration,
    recordMethodLatency,
    safeInvokeHook,
    snapshotDurationStats,
    snapshotMethodLatencyMetrics,
} from './observability.js';
import { remoteErrorCodec, toRemoteErrorPayload } from './remote-error.js';
import type { RpcHandlerContext, RpcHandlers, RpcOverloadPolicy, RpcServer, RpcTransportOptions } from './types.js';

class ByteArrayBinaryReader implements BinaryReader {
    readonly #bytes: Uint8Array;
    readonly #view: DataView;
    #offset = 0;
    constructor(bytes: Uint8Array) {
        this.#bytes = bytes;
        this.#view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    }
    get remainingBytes(): number {
        return this.#bytes.byteLength - this.#offset;
    }
    readU8(): number {
        this.ensureCapacity(1);
        const value = this.#bytes[this.#offset] ?? 0;
        this.#offset += 1;
        return value;
    }
    readU16(): number {
        this.ensureCapacity(2);
        const value = this.#view.getUint16(this.#offset, true);
        this.#offset += 2;
        return value;
    }
    readU32(): number {
        this.ensureCapacity(4);
        const value = this.#view.getUint32(this.#offset, true);
        this.#offset += 4;
        return value;
    }
    readI32(): number {
        this.ensureCapacity(4);
        const value = this.#view.getInt32(this.#offset, true);
        this.#offset += 4;
        return value;
    }
    readF64(): number {
        this.ensureCapacity(8);
        const value = this.#view.getFloat64(this.#offset, true);
        this.#offset += 8;
        return value;
    }
    readBool(): boolean {
        return this.readU8() !== 0;
    }
    readBytes(length: number): Uint8Array {
        this.ensureCapacity(length);
        const value = this.#bytes.slice(this.#offset, this.#offset + length);
        this.#offset += length;
        return value;
    }
    readStringUtf8(): string {
        const byteLength = this.readU32();
        return byteLength === 0 ? '' : decodeUtf8(this.readBytes(byteLength));
    }
    readVarBytes(): Uint8Array {
        return this.readBytes(this.readU32());
    }
    readArrayHeader(): number {
        return this.readU32();
    }
    assertFullyRead(): void {
        if (this.#offset !== this.#bytes.byteLength) {
            throw new ShirikaProtocolError(`Binary reader did not consume payload exactly: expected ${this.#bytes.byteLength}, read ${this.#offset}`);
        }
    }
    private ensureCapacity(requiredBytes: number): void {
        if (requiredBytes > this.remainingBytes) {
            throw new ShirikaProtocolError(`Binary reader underflow: need ${requiredBytes} bytes with only ${this.remainingBytes} bytes remaining`);
        }
    }
}
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
        this.#maxInFlight = normalizePositiveInteger(options.maxInFlight, Number.POSITIVE_INFINITY, 'maxInFlight');
        this.#maxQueuedRequests = normalizeNonNegativeInteger(options.maxQueuedRequests, Number.POSITIVE_INFINITY, 'maxQueuedRequests');
        this.#overloadPolicy = options.overloadPolicy ?? 'queue';
        this.#onFatalError = options.onFatalError;
        this.#onNotifyError = options.onNotifyError;
        this.#notifyErrorPolicy = options.notifyErrorPolicy ?? 'log';
        if (this.#notifyErrorPolicy === 'callback' && !this.#onNotifyError) {
            throw new TypeError('notifyErrorPolicy="callback" requires onNotifyError');
        }
    }
    snapshot(): RpcTransportSnapshot {
        const endpoint = this.#endpoint.snapshot();
        return {
            at: Date.now(),
            role: 'server',
            closed: this.#closed,
            endpoint,
            counters: {
                callsInFlight: this.#requestInvocations.size,
                queuedRequests: this.#pendingQueue.length,
                completed: this.#completed,
                failed: this.#failed,
                timedOut: this.#timedOut,
                cancelled: this.#cancelled,
                notifyErrors: this.#notifyErrors,
            },
            timings: {
                encodeTimeMs: endpoint.timings.encodeTimeMs,
                queueWaitMs: endpoint.timings.queueWaitMs,
                handlerTimeMs: snapshotDurationStats(this.#handlerTimeStats),
                responseSendTimeMs: snapshotDurationStats(this.#responseSendTimeStats),
            },
            metrics: {
                handlerLatencyByMethod: snapshotHandlerLatencyByMethod(this.#handlerLatencyByMethod),
            },
        };
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
    private reportFatalError(error: unknown, phase: 'serve-loop' | 'handler' | 'shutdown' = 'serve-loop'): void {
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
                role: 'server',
                phase,
                error,
                snapshot,
            },
            'onFatalError',
        );
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
                this.reportFatalError(error, 'serve-loop');
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
        const deadline = deriveDeadline(frame);
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
                    this.reportFatalError(error, 'handler');
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
            if (kind === 'request') {
                if (shouldReply(invocation)) {
                    this.recordRequestOutcome(await this.sendErrorResponse(frame.header.requestId, frame.header.methodId, error, invocation.deadline));
                } else {
                    this.recordRequestOutcome(classifySuppressedRequest(invocation));
                }
            } else {
                this.handleNotifyFailure(undefined, frame.header.methodId, frame.header.requestId, error);
            }
            return;
        }
        const methodName = entry.method;
        const def = entry.def;
        const handler = this.#handlers[methodName] as (request: RequestOf<C, MethodNames<C>>, ctx: RpcHandlerContext<C, MethodNames<C>>) => unknown;
        const request = frame.readWithCodec(def.request) as RequestOf<C, MethodNames<C>>;
        let response: unknown;
        const handlerStartedAt = nowMs();
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
            if (kind === 'request') {
                if (shouldReply(invocation)) {
                    this.recordRequestOutcome(await this.sendErrorResponse(frame.header.requestId, def.id, error, invocation.deadline));
                } else {
                    this.recordRequestOutcome(classifySuppressedRequest(invocation));
                }
            } else {
                this.handleNotifyFailure(String(methodName), def.id, frame.header.requestId, error);
            }
            return;
        }
        this.recordHandlerLatency(String(methodName), kind, nowMs() - handlerStartedAt);
        if (kind !== 'request') {
            return;
        }
        if (!shouldReply(invocation)) {
            this.recordRequestOutcome(classifySuppressedRequest(invocation));
            return;
        }
        this.recordRequestOutcome(await this.sendOkResponse(frame.header.requestId, def.id, def.response, response, invocation.deadline));
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
        switch (this.#notifyErrorPolicy) {
            case 'callback':
                return;
            case 'throw':
                throw error instanceof Error ? error : new Error(describeError(error));
            case 'log':
                console.error(`[shirika-rpc] notify handler failed for ${methodName ?? `method#${methodId}`}`, error);
                return;
            default:
                console.error(`[shirika-rpc] notify handler failed for ${methodName ?? `method#${methodId}`}`, error);
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
        const startedAt = nowMs();
        try {
            await this.#endpoint.send(Opcode.RESPONSE_OK, requestId, methodId, codec, response, createSendOptions(timing.timeoutMs, timing.deadline));
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
    private async sendErrorResponse(requestId: number, methodId: number, error: unknown, deadline: number | undefined): Promise<SendReplyOutcome> {
        const timing = resolveResponseTiming(deadline, this.#defaultResponseTimeoutMs);
        if (timing.timeoutMs !== undefined && timing.timeoutMs <= 0) {
            return 'timed-out';
        }
        const basePayload = toRemoteErrorPayload(error);
        const statusCode = resolveErrorStatusCode(error, basePayload.code);
        const startedAt = nowMs();
        try {
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
                    return 'sent';
                } catch (sendError) {
                    if (sendError instanceof ShirikaTimeoutError) {
                        return 'timed-out';
                    }
                    if (!(sendError instanceof ShirikaOversizeError)) {
                        throw sendError;
                    }
                }
            }
            throw new ShirikaOversizeError('Remote error response does not fit into the transport ring');
        } finally {
            recordDuration(this.#responseSendTimeStats, nowMs() - startedAt);
        }
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
function deriveDeadline(frame: FrameReadView): number | undefined {
    if ((frame.header.flags & FrameFlag.HAS_DEADLINE) === 0) {
        return undefined;
    }
    return Date.now() + frame.header.reserved;
}
function shouldReply(invocation: ActiveInvocation): boolean {
    if (invocation.controller.signal.aborted) {
        return false;
    }
    if (invocation.deadline === undefined) {
        return true;
    }
    return invocation.deadline > Date.now();
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
function classifyTerminalReason(reason: unknown): TerminalOutcome {
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
function normalizePositiveInteger(value: number | undefined, fallback: number, label: string): number {
    if (value === undefined) {
        return fallback;
    }
    if (!Number.isInteger(value) || value <= 0) {
        throw new TypeError(`${label} must be a positive integer, received ${value}`);
    }
    return value;
}
function normalizeNonNegativeInteger(value: number | undefined, fallback: number, label: string): number {
    if (value === undefined) {
        return fallback;
    }
    if (!Number.isInteger(value) || value < 0) {
        throw new TypeError(`${label} must be a non-negative integer, received ${value}`);
    }
    return value;
}
function snapshotHandlerLatencyByMethod(
    metricsByMethod: Map<string, ReturnType<typeof createMethodLatencyMetrics>>,
): Record<string, ReturnType<typeof snapshotMethodLatencyMetrics>> {
    const snapshot: Record<string, ReturnType<typeof snapshotMethodLatencyMetrics>> = {};
    for (const [methodName, metrics] of metricsByMethod) {
        snapshot[methodName] = snapshotMethodLatencyMetrics(metrics);
    }
    return snapshot;
}
function createRemoteErrorPayloadAttempts(payload: ReturnType<typeof toRemoteErrorPayload>): ReturnType<typeof toRemoteErrorPayload>[] {
    const attempts: ReturnType<typeof toRemoteErrorPayload>[] = [];
    const push = (candidate: ReturnType<typeof toRemoteErrorPayload>) => {
        const previous = attempts.at(-1);
        if (previous && JSON.stringify(previous) === JSON.stringify(candidate)) {
            return;
        }
        attempts.push(candidate);
    };
    push(payload);
    if (payload.stack !== undefined) {
        push({
            name: payload.name,
            message: payload.message,
            ...(payload.code !== undefined ? { code: payload.code } : {}),
            ...(payload.data !== undefined ? { data: payload.data } : {}),
        });
    }
    if (payload.data !== undefined || payload.stack !== undefined) {
        push({
            name: payload.name,
            message: payload.message,
            ...(payload.code !== undefined ? { code: payload.code } : {}),
        });
    }
    push({
        name: payload.name,
        message: truncateRemoteErrorMessage(payload.message, 256),
        ...(payload.code !== undefined ? { code: payload.code } : {}),
    });
    push({
        name: payload.name,
        message: truncateRemoteErrorMessage(payload.message, 128),
        ...(payload.code !== undefined ? { code: payload.code } : {}),
    });
    push({
        name: 'Error',
        message: truncateRemoteErrorMessage(payload.message, 64),
        ...(payload.code !== undefined ? { code: payload.code } : {}),
    });
    return attempts;
}
function truncateRemoteErrorMessage(message: string, maxLength: number): string {
    if (message.length <= maxLength) {
        return message;
    }
    return `${message.slice(0, Math.max(0, maxLength - 1))}…`;
}
export function createRpcServer<C extends ContractShape>(
    contract: ContractInput<C>,
    handlers: RpcHandlers<C>,
    endpoint: DuplexEndpoint,
    options?: RpcTransportOptions,
): RpcServerImpl<C> {
    return new RpcServerImpl(contract, handlers, endpoint, options);
}
