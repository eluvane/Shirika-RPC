import { throwIfAborted } from '../abort.js';
import type { BinaryCodec, Codec, MsgpackCodec } from '../codec/types.js';
import {
    hasMeasuredWriterFastPathWitness,
    isMeasuredWriterValueInScope,
    isPreparedBinaryCodec,
    type PreparedBinaryCodec,
    type PreparedMeasuredWriterSelection,
    prepareBinaryCodec,
    selectPreparedMeasuredWriter,
    validateAndDecodePreparedEncodedPayload,
} from '../codec/witness.js';
import { FRAME_MAGIC, FRAME_VERSION, HEADER_SIZE, Opcode, TransportErrorHint, UINT32_MAX } from '../constants.js';
import { ShirikaClosedError, ShirikaOversizeError, ShirikaProtocolError, ShirikaTimeoutError } from '../errors.js';
import { isFastPathEnabled } from '../fast-path-strategy.js';
import {
    createDurationStats,
    createFrameSizeHistogram,
    createRingSaturationTimeline,
    type DuplexEndpointSnapshot,
    nowMs,
    observeRingSaturation,
    observeRingSaturationSample,
    recordDuration,
    recordHistogramValue,
    ringSaturation,
    snapshotDurationStats,
    snapshotHistogram,
    snapshotRingSaturationTimeline,
} from '../rpc/observability.js';
import { align8, deadlineFromTimeout, remainingTimeout, u32 } from '../utils.js';
import { RingBinaryReader } from './ring-reader.js';
import { RingBinaryWriter, unsafeCreateTrustedMeasuredRingBinaryWriter } from './ring-writer.js';
import type { RingSnapshot, SharedRingBuffer } from './shared-ring.js';

const FRAME_FLAG_ALIGNED_BYTES_PAYLOAD = 1 << 30;

declare const validatedFrameHeaderBrand: unique symbol;
declare const validatedFrameBrand: unique symbol;
declare const framePayloadRangeBrand: unique symbol;
declare const validatedAlignedBytesPayloadRangeBrand: unique symbol;

export interface FrameHeader {
    readonly magic: number;
    readonly version: number;
    readonly opcode: Opcode;
    readonly flags: number;
    readonly requestId: number;
    readonly methodId: number;
    readonly statusCode: number;
    readonly payloadLength: number;
    readonly reserved: number;
}
interface ValidatedFrameHeader extends FrameHeader {
    readonly [validatedFrameHeaderBrand]: true;
}
interface ValidatedFrameHeaderResult {
    readonly header: ValidatedFrameHeader;
    readonly frameSize: number;
    readonly payloadLength: number;
    readonly paddingLength: number;
}
interface FramePayloadRange {
    readonly [framePayloadRangeBrand]: true;
    readonly payloadSeq: number;
    readonly payloadLength: number;
    readonly paddingSeq: number;
    readonly paddingLength: number;
}
interface ValidatedAlignedBytesPayloadRange extends FramePayloadRange {
    readonly [validatedAlignedBytesPayloadRangeBrand]: true;
    readonly parentFrame: ValidatedFrame;
    readonly prefixSeq: number;
    readonly prefixLength: 8;
    readonly prefixReserved: number;
    readonly byteLength: number;
    readonly bytesSeq: number;
}
interface ValidatedFrame extends FramePayloadRange {
    readonly [validatedFrameBrand]: true;
    readonly header: ValidatedFrameHeader;
    readonly readSeq: number;
    readonly frameSize: number;
    readonly nextReadSeq: number;
    readonly opcode: Opcode;
    readonly hasAlignedBytesPayload: boolean;
}
export interface FramePayloadRangeSnapshot {
    readonly readSeq: number;
    readonly payloadSeq: number;
    readonly payloadLength: number;
    readonly paddingSeq: number;
    readonly paddingLength: number;
    readonly frameSize: number;
    readonly nextReadSeq: number;
}
export interface SendFrameOptions {
    readonly timeoutMs?: number;
    readonly deadline?: number;
    readonly flags?: number;
    readonly statusCode?: number;
    readonly reserved?: number;
    readonly signal?: AbortSignal;
}
export interface DuplexEndpointOptions {
    readonly inbound: SharedRingBuffer;
    readonly outbound: SharedRingBuffer;
}
export class FrameReadView {
    readonly header: FrameHeader;
    readonly payloadLength: number;
    readonly frameSize: number;
    readonly #ring: SharedRingBuffer;
    readonly #frame: ValidatedFrame;
    readonly #alignedBytesRange: ValidatedAlignedBytesPayloadRange | undefined;
    readonly #onFinished: (() => void) | undefined;
    readonly #useValidatedFrameFastPaths: boolean;
    #payloadRangeSnapshot: FramePayloadRangeSnapshot | undefined;
    #done = false;
    constructor(ring: SharedRingBuffer, readSeq: number, header: FrameHeader, frameSize?: number, onFinished?: () => void) {
        const headerValidation = validateFrameHeader(header, ring.capacityBytes);
        if (frameSize !== undefined && frameSize !== headerValidation.frameSize) {
            throw new ShirikaProtocolError(`Validated frame size mismatch: supplied frameSize=${frameSize}, computed frameSize=${headerValidation.frameSize}`);
        }
        if (ring.readableBytesFrom(readSeq) < headerValidation.frameSize) {
            throw new ShirikaProtocolError('Truncated frame detected after header commit');
        }
        const frame = assumeValidatedFrame(readSeq, headerValidation);
        this.#ring = ring;
        this.#frame = frame;
        this.#useValidatedFrameFastPaths = isFastPathEnabled('validatedFrameWitness');
        this.#alignedBytesRange =
            this.#useValidatedFrameFastPaths && isFastPathEnabled('validatedAlignedBytesPayload') && frame.hasAlignedBytesPayload
                ? validateAlignedBytesPayloadRange(ring, frame)
                : undefined;
        this.header = frame.header;
        this.payloadLength = frame.payloadLength;
        this.frameSize = frame.frameSize;
        this.#onFinished = onFinished;
    }
    get payloadRange(): FramePayloadRangeSnapshot {
        this.#payloadRangeSnapshot ??= snapshotPayloadRange(this.#frame);
        return this.#payloadRangeSnapshot;
    }
    readBinary<T>(codec: BinaryCodec<T>): T {
        try {
            if (isBytesCodec(codec) && this.#frame.hasAlignedBytesPayload) {
                const value = this.shouldUseAlignedBytesFastPath()
                    ? unsafeReadAlignedBytesPayload(this.#ring, this.requireAlignedBytesPayloadRange())
                    : safeReadAlignedBytesPayload(this.#ring, this.#frame);
                this.finish();
                return value as T;
            }
            const prepared = prepareBinaryCodec(codec);
            if (prepared !== undefined && this.#useValidatedFrameFastPaths) {
                const decoded = validateAndDecodePreparedEncodedPayload(prepared, this.#ring, this.#frame);
                if (decoded !== undefined) {
                    this.finish();
                    return decoded.value;
                }
            }
            const reader = createFramePayloadReader(this.#ring, this.#frame);
            const fallbackCodec = prepared?.codec ?? (isPreparedBinaryCodec(codec) ? codec.codec : codec);
            const value = fallbackCodec.read(reader);
            reader.assertFullyRead();
            this.finish();
            return value;
        } catch (error) {
            this.finish();
            throw error;
        }
    }
    readMsgpack<T>(codec: MsgpackCodec<T>): T {
        if (codec.read) {
            try {
                const reader = createFramePayloadReader(this.#ring, this.#frame);
                const value = codec.read(reader, this.payloadLength);
                reader.assertFullyRead();
                this.finish();
                return value;
            } catch (error) {
                this.finish();
                throw error;
            }
        }
        const bytes = this.readPayloadBytes();
        return codec.decode(bytes);
    }
    readWithCodec<T>(codec: Codec<T>): T {
        return codec.kind === 'binary' ? this.readBinary(codec) : this.readMsgpack(codec);
    }
    readPayloadBytes(): Uint8Array {
        try {
            const bytes = this.#frame.hasAlignedBytesPayload
                ? this.shouldUseAlignedBytesFastPath()
                    ? unsafeReadAlignedBytesPayloadAsBinaryBytes(this.#ring, this.requireAlignedBytesPayloadRange())
                    : safeReadAlignedBytesPayloadAsBinaryBytes(this.#ring, this.#frame)
                : this.#ring.readBytes(this.#frame.payloadSeq, this.#frame.payloadLength);
            this.finish();
            return bytes;
        } catch (error) {
            this.finish();
            throw error;
        }
    }
    discard(): void {
        this.finish();
    }
    private shouldUseAlignedBytesFastPath(): boolean {
        return this.#useValidatedFrameFastPaths && isFastPathEnabled('validatedAlignedBytesPayload') && this.#alignedBytesRange !== undefined;
    }
    private requireAlignedBytesPayloadRange(): ValidatedAlignedBytesPayloadRange {
        if (this.#alignedBytesRange === undefined) {
            throw new ShirikaProtocolError('Aligned bytes payload witness missing after aligned flag validation');
        }
        return this.#alignedBytesRange;
    }
    private finish(): void {
        if (this.#done) {
            return;
        }
        this.#done = true;
        this.#ring.commitRead(this.#frame.nextReadSeq);
        if (!this.#onFinished) {
            return;
        }
        try {
            this.#onFinished();
        } catch {
            return;
        }
    }
}
export class DuplexEndpoint {
    readonly inbound: SharedRingBuffer;
    readonly outbound: SharedRingBuffer;
    #sendQueue: Promise<void> | undefined;
    #closed = false;
    readonly #encodeTimeStats = createDurationStats();
    readonly #queueWaitStats = createDurationStats();
    readonly #sendTimeStats = createDurationStats();
    readonly #sentFrameSizeHistogram = createFrameSizeHistogram();
    readonly #receivedFrameSizeHistogram = createFrameSizeHistogram();
    readonly #inboundSaturationTimeline = createRingSaturationTimeline();
    readonly #outboundSaturationTimeline = createRingSaturationTimeline();
    #framesSent = 0;
    #framesReceived = 0;
    #sendErrors = 0;
    #receiveErrors = 0;
    constructor(options: DuplexEndpointOptions) {
        this.inbound = options.inbound;
        this.outbound = options.outbound;
    }
    get closed(): boolean {
        return this.#closed;
    }
    snapshot(): DuplexEndpointSnapshot {
        const inbound = this.inbound.snapshot();
        const outbound = this.outbound.snapshot();
        this.observeInboundSaturation(inbound);
        this.observeOutboundSaturation(outbound);
        const inboundSaturation = ringSaturation(inbound);
        const outboundSaturation = ringSaturation(outbound);
        return {
            closed: this.#closed,
            inbound,
            outbound,
            saturation: {
                inbound: inboundSaturation,
                outbound: outboundSaturation,
                max: Math.max(inboundSaturation, outboundSaturation),
            },
            counters: {
                framesSent: this.#framesSent,
                framesReceived: this.#framesReceived,
                sendErrors: this.#sendErrors,
                receiveErrors: this.#receiveErrors,
            },
            timings: {
                encodeTimeMs: snapshotDurationStats(this.#encodeTimeStats),
                queueWaitMs: snapshotDurationStats(this.#queueWaitStats),
                sendTimeMs: snapshotDurationStats(this.#sendTimeStats),
            },
            metrics: {
                messageSizes: {
                    measuredAs: 'frame-size-bytes',
                    sent: snapshotHistogram(this.#sentFrameSizeHistogram),
                    received: snapshotHistogram(this.#receivedFrameSizeHistogram),
                },
                saturationTimeline: {
                    inbound: snapshotRingSaturationTimeline(this.#inboundSaturationTimeline),
                    outbound: snapshotRingSaturationTimeline(this.#outboundSaturationTimeline),
                },
            },
        };
    }
    async send<T>(opcode: Opcode, requestId: number, methodId: number, codec: Codec<T>, payload: T, options: SendFrameOptions = {}): Promise<void> {
        assertUInt32(requestId, 'requestId');
        assertUInt32(methodId, 'methodId');
        const queuedAt = nowMs();
        const run = async () => {
            recordDuration(this.#queueWaitStats, nowMs() - queuedAt);
            throwIfAborted(options.signal);
            if (this.#closed) {
                throw new ShirikaClosedError('Cannot send on a closed endpoint');
            }
            const effectiveTimeoutMs = resolveEffectiveTimeout(options);
            const effectiveReserved =
                options.deadline !== undefined && options.reserved === undefined ? Math.max(0, remainingTimeout(options.deadline) ?? 0) : options.reserved;
            const sendOptions: SendFrameOptions = {
                ...options,
                ...(effectiveTimeoutMs !== undefined ? { timeoutMs: effectiveTimeoutMs } : {}),
                ...(effectiveReserved !== undefined ? { reserved: effectiveReserved } : {}),
            };
            try {
                await this.writeFrame(opcode, requestId, methodId, codec, payload, sendOptions);
            } catch (error) {
                this.#sendErrors += 1;
                throw error;
            }
        };
        const previous = this.#sendQueue;
        const scheduled = previous === undefined ? run() : previous.then(run, run);
        const tail = scheduled.catch(() => undefined);
        this.#sendQueue = tail;
        void tail.then(() => {
            if (this.#sendQueue === tail) {
                this.#sendQueue = undefined;
            }
        });
        return scheduled;
    }
    async receive(timeoutMs?: number): Promise<FrameReadView> {
        if (this.#closed) {
            throw new ShirikaClosedError('Cannot receive on a closed endpoint');
        }
        try {
            const readSeq = await this.inbound.waitForReadable(HEADER_SIZE, timeoutMs);
            let frame: FrameReadView;
            try {
                frame = new FrameReadView(this.inbound, readSeq, readFrameHeader(this.inbound, readSeq), undefined, () => {
                    this.observeCurrentInboundSaturation();
                });
            } catch (error) {
                this.markErrored(TransportErrorHint.PROTOCOL);
                throw error;
            }
            this.#framesReceived += 1;
            recordHistogramValue(this.#receivedFrameSizeHistogram, frame.frameSize);
            this.observeCurrentInboundSaturation();
            return frame;
        } catch (error) {
            this.#receiveErrors += 1;
            throw error;
        }
    }
    async bestEffortClose(timeoutMs = 50): Promise<void> {
        if (!this.#closed) {
            try {
                const deadline = deadlineFromTimeout(timeoutMs);
                await this.send(Opcode.CLOSE, 0, 0, VOID_CODEC, undefined, deadline === undefined ? { timeoutMs } : { timeoutMs, deadline });
            } catch {
                return;
            }
        }
        this.forceClose(TransportErrorHint.CLOSED);
    }
    forceClose(errorHint: number = TransportErrorHint.CLOSED): void {
        if (this.#closed) {
            return;
        }
        this.#closed = true;
        this.outbound.markClosing();
        this.inbound.markClosing();
        this.outbound.markClosed(errorHint);
        this.inbound.markClosed(errorHint);
    }
    markErrored(errorHint: number = TransportErrorHint.PROTOCOL): void {
        this.#closed = true;
        this.outbound.markErrored(errorHint);
        this.inbound.markErrored(errorHint);
    }
    private async writeFrame<T>(opcode: Opcode, requestId: number, methodId: number, codec: Codec<T>, payload: T, options: SendFrameOptions): Promise<void> {
        const encodeStartedAt = nowMs();
        let payloadBytes: Uint8Array | undefined;
        let payloadLength: number;
        let preparedBinaryCodec: PreparedBinaryCodec<T> | undefined;
        let measuredWriterSelection: PreparedMeasuredWriterSelection | undefined;
        let usePrimitiveMeasuredWriterFastPath = false;
        const useAlignedBytesPayload = payload instanceof Uint8Array && isFastPathEnabled('validatedAlignedBytesPayload') && isBytesCodec(codec);
        if (useAlignedBytesPayload) {
            payloadLength = alignedBytesPayloadLength(payload.byteLength);
        } else if (codec.kind === 'binary') {
            const fallbackCodec = isPreparedBinaryCodec(codec) ? codec.codec : codec;
            if (hasMeasuredWriterFastPathWitness(codec)) {
                preparedBinaryCodec = prepareBinaryCodec(codec);
                if (preparedBinaryCodec !== undefined) {
                    if (preparedBinaryCodec.witness.codecKind === 'primitive' || preparedBinaryCodec.witness.codecKind === 'bytes') {
                        payloadLength = preparedBinaryCodec.codec.measure(payload);
                        usePrimitiveMeasuredWriterFastPath = isMeasuredWriterValueInScope(preparedBinaryCodec, payload);
                    } else {
                        measuredWriterSelection = selectPreparedMeasuredWriter(preparedBinaryCodec, payload);
                        payloadLength = measuredWriterSelection?.payloadLength ?? preparedBinaryCodec.codec.measure(payload);
                    }
                } else {
                    payloadLength = fallbackCodec.measure(payload);
                }
            } else {
                payloadLength = fallbackCodec.measure(payload);
            }
        } else if (codec.measure && codec.write) {
            payloadLength = codec.measure(payload);
        } else {
            payloadBytes = codec.encode(payload);
            payloadLength = payloadBytes.byteLength;
        }
        recordDuration(this.#encodeTimeStats, nowMs() - encodeStartedAt);
        const frameSize = frameSizeForPayloadLength(payloadLength, this.outbound.capacityBytes, 'send');
        if (options.timeoutMs !== undefined && options.timeoutMs <= 0) {
            throw new ShirikaTimeoutError('Timed out before frame could be queued for sending');
        }
        const sendStartedAt = nowMs();
        this.observeCurrentOutboundSaturation();
        const writeSeq = await this.outbound.waitForWritable(frameSize, options.timeoutMs, options.signal);
        const header: FrameHeader = {
            magic: FRAME_MAGIC,
            version: FRAME_VERSION,
            opcode,
            flags: (options.flags ?? 0) | (useAlignedBytesPayload ? FRAME_FLAG_ALIGNED_BYTES_PAYLOAD : 0),
            requestId: u32(requestId),
            methodId: u32(methodId),
            statusCode: options.statusCode ?? 0,
            payloadLength,
            reserved: options.reserved ?? 0,
        };
        writeFrameHeader(this.outbound, writeSeq, header);
        const payloadSeq = u32(writeSeq + HEADER_SIZE);
        if (payloadLength > 0) {
            if (useAlignedBytesPayload) {
                writeAlignedBytesPayload(this.outbound, payloadSeq, payload as Uint8Array);
            } else if (codec.kind === 'binary') {
                if ((usePrimitiveMeasuredWriterFastPath || measuredWriterSelection !== undefined) && preparedBinaryCodec !== undefined) {
                    const writer = unsafeCreateTrustedMeasuredRingBinaryWriter(this.outbound, payloadSeq, payloadLength);
                    if (measuredWriterSelection?.strategy === undefined) {
                        preparedBinaryCodec.write(writer, payload);
                    } else {
                        measuredWriterSelection.strategy.write(writer, payload, measuredWriterSelection.payloadLength);
                    }
                    writer.finish();
                } else {
                    const writer = new RingBinaryWriter(this.outbound, payloadSeq, payloadLength);
                    const fallbackCodec = preparedBinaryCodec?.codec ?? (isPreparedBinaryCodec(codec) ? codec.codec : codec);
                    fallbackCodec.write(writer, payload);
                    writer.finish();
                }
            } else if (codec.write) {
                const writer = new RingBinaryWriter(this.outbound, payloadSeq, payloadLength);
                codec.write(writer, payload);
                writer.finish();
            } else if (payloadBytes !== undefined) {
                this.outbound.writeBytes(payloadSeq, payloadBytes);
            }
        }
        const paddingBytes = frameSize - HEADER_SIZE - payloadLength;
        if (paddingBytes > 0) {
            this.outbound.zeroFill(u32(payloadSeq + payloadLength), paddingBytes);
        }
        this.outbound.commitWrite(u32(writeSeq + frameSize));
        this.#framesSent += 1;
        recordHistogramValue(this.#sentFrameSizeHistogram, frameSize);
        this.observeCurrentOutboundSaturation();
        recordDuration(this.#sendTimeStats, nowMs() - sendStartedAt);
    }
    private observeCurrentInboundSaturation(): void {
        this.observeSaturation(this.inbound, this.#inboundSaturationTimeline);
    }
    private observeCurrentOutboundSaturation(): void {
        this.observeSaturation(this.outbound, this.#outboundSaturationTimeline);
    }
    private observeInboundSaturation(snapshot: RingSnapshot): void {
        try {
            observeRingSaturation(this.#inboundSaturationTimeline, snapshot);
        } catch {
            return;
        }
    }
    private observeOutboundSaturation(snapshot: RingSnapshot): void {
        try {
            observeRingSaturation(this.#outboundSaturationTimeline, snapshot);
        } catch {
            return;
        }
    }
    private observeSaturation(ring: SharedRingBuffer, timeline: ReturnType<typeof createRingSaturationTimeline>): void {
        try {
            observeRingSaturationSample(timeline, ring.sampleUsedBytes(), ring.capacityBytes);
        } catch {
            return;
        }
    }
}
const VOID_CODEC: BinaryCodec<void> = {
    kind: 'binary',
    measure: () => 0,
    write() {
        return undefined;
    },
    read() {
        return undefined;
    },
};
function resolveEffectiveTimeout(options: SendFrameOptions): number | undefined {
    if (options.deadline !== undefined) {
        return remainingTimeout(options.deadline);
    }
    return options.timeoutMs;
}
function isBytesCodec(codec: Codec<unknown>): codec is BinaryCodec<Uint8Array> {
    if (codec.kind !== 'binary') {
        return false;
    }
    const prepared = prepareBinaryCodec(codec);
    return prepared?.witness.codecKind === 'bytes' && prepared.witness.signature === 'bytes';
}
function hasAlignedBytesPayload(header: FrameHeader): boolean {
    return (header.flags & FRAME_FLAG_ALIGNED_BYTES_PAYLOAD) !== 0;
}
function createFramePayloadReader(ring: SharedRingBuffer, range: FramePayloadRange): RingBinaryReader {
    return new RingBinaryReader(ring, range.payloadSeq, range.payloadLength);
}
function snapshotPayloadRange(frame: ValidatedFrame): FramePayloadRangeSnapshot {
    return Object.freeze({
        readSeq: frame.readSeq,
        payloadSeq: frame.payloadSeq,
        payloadLength: frame.payloadLength,
        paddingSeq: frame.paddingSeq,
        paddingLength: frame.paddingLength,
        frameSize: frame.frameSize,
        nextReadSeq: frame.nextReadSeq,
    });
}
function assumeValidatedFrame(readSeq: number, validation: ValidatedFrameHeaderResult): ValidatedFrame {
    const payloadSeq = u32(readSeq + HEADER_SIZE);
    const paddingSeq = u32(payloadSeq + validation.payloadLength);
    const nextReadSeq = u32(readSeq + validation.frameSize);
    return {
        header: validation.header,
        readSeq,
        frameSize: validation.frameSize,
        nextReadSeq,
        opcode: validation.header.opcode,
        hasAlignedBytesPayload: hasAlignedBytesPayload(validation.header),
        payloadSeq,
        payloadLength: validation.payloadLength,
        paddingSeq,
        paddingLength: validation.paddingLength,
    } as ValidatedFrame;
}
function alignedBytesPayloadLength(byteLength: number): number {
    return byteLength + 8;
}
function writeAlignedBytesPayload(ring: SharedRingBuffer, seq: number, payload: Uint8Array): void {
    writeAlignedBytesPrefix(ring, seq, payload.byteLength);
    ring.writeBytes(u32(seq + 8), payload);
}
function validateAlignedBytesPayloadRange(ring: SharedRingBuffer, frame: ValidatedFrame): ValidatedAlignedBytesPayloadRange {
    if (!frame.hasAlignedBytesPayload) {
        throw new ShirikaProtocolError('Aligned bytes payload witness requires the aligned-bytes frame flag');
    }
    if (frame.payloadLength < 8) {
        throw new ShirikaProtocolError(`Invalid aligned bytes payload: payloadLength=${frame.payloadLength} is shorter than the 8-byte prefix`);
    }
    const prefix = readAlignedBytesPrefix(ring, frame.payloadSeq);
    validateAlignedBytesPayloadLength(frame.payloadLength, prefix.byteLength);
    return {
        parentFrame: frame,
        prefixSeq: frame.payloadSeq,
        prefixLength: 8,
        prefixReserved: prefix.reserved,
        byteLength: prefix.byteLength,
        bytesSeq: u32(frame.payloadSeq + 8),
        payloadSeq: frame.payloadSeq,
        payloadLength: frame.payloadLength,
        paddingSeq: frame.paddingSeq,
        paddingLength: frame.paddingLength,
    } as ValidatedAlignedBytesPayloadRange;
}

function safeReadAlignedBytesPayload(ring: SharedRingBuffer, frame: ValidatedFrame): Uint8Array {
    const range = validateAlignedBytesPayloadRange(ring, frame);
    return ring.readBytes(range.bytesSeq, range.byteLength);
}

function safeReadAlignedBytesPayloadAsBinaryBytes(ring: SharedRingBuffer, frame: ValidatedFrame): Uint8Array {
    const range = validateAlignedBytesPayloadRange(ring, frame);
    const bytes = new Uint8Array(range.byteLength + 4);
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(0, range.byteLength, true);
    ring.readInto(range.bytesSeq, bytes, 4, range.byteLength);
    return bytes;
}

/**
 * UNSAFE: copies the body range described by `ValidatedAlignedBytesPayloadRange`.
 *
 * Safety precondition: `range` must have been produced by `validateAlignedBytesPayloadRange()` for
 * the same ring/frame. The prefix relation is not rechecked here; the helper only copies the
 * already-validated byte body range.
 */
function unsafeReadAlignedBytesPayload(ring: SharedRingBuffer, range: ValidatedAlignedBytesPayloadRange): Uint8Array {
    return ring.readBytes(range.bytesSeq, range.byteLength);
}

/**
 * UNSAFE: returns the aligned payload body in the ordinary binary `bytes` codec representation.
 *
 * Safety precondition: `range` must have been produced by `validateAlignedBytesPayloadRange()` for
 * the same ring/frame. This helper intentionally does not repeat
 * `payloadLength === byteLength + 8`; it rebuilds the 4-byte binary-codec length prefix and copies
 * the validated body range.
 */
function unsafeReadAlignedBytesPayloadAsBinaryBytes(ring: SharedRingBuffer, range: ValidatedAlignedBytesPayloadRange): Uint8Array {
    const bytes = new Uint8Array(range.byteLength + 4);
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(0, range.byteLength, true);
    ring.readInto(range.bytesSeq, bytes, 4, range.byteLength);
    return bytes;
}

function validateAlignedBytesPayloadLength(payloadLength: number, byteLength: number): void {
    if (payloadLength !== alignedBytesPayloadLength(byteLength)) {
        throw new ShirikaProtocolError(`Invalid aligned bytes payload: declared payloadLength=${payloadLength}, byteLength=${byteLength}`);
    }
}
function writeAlignedBytesPrefix(ring: SharedRingBuffer, seq: number, byteLength: number): void {
    const view = ring.getContiguousDataView(seq, 8);
    if (view !== null) {
        view.setUint32(0, byteLength, true);
        view.setUint32(4, 0, true);
        return;
    }
    const bytes = new Uint8Array(8);
    const fallback = new DataView(bytes.buffer);
    fallback.setUint32(0, byteLength, true);
    fallback.setUint32(4, 0, true);
    ring.writeBytes(seq, bytes);
}
function readAlignedBytesPrefix(ring: SharedRingBuffer, seq: number): { readonly byteLength: number; readonly reserved: number } {
    const view = ring.getContiguousDataView(seq, 8);
    if (view !== null) {
        return { byteLength: view.getUint32(0, true), reserved: view.getUint32(4, true) };
    }
    const bytes = ring.readBytes(seq, 8);
    const fallback = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { byteLength: fallback.getUint32(0, true), reserved: fallback.getUint32(4, true) };
}
function writeFrameHeader(ring: SharedRingBuffer, seq: number, header: FrameHeader): void {
    const view = ring.getContiguousDataView(seq, HEADER_SIZE);
    if (view !== null) {
        writeHeaderView(view, header);
        return;
    }
    const bytes = new Uint8Array(HEADER_SIZE);
    writeHeaderView(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), header);
    ring.writeBytes(seq, bytes);
}
function readFrameHeader(ring: SharedRingBuffer, seq: number): FrameHeader {
    const view = ring.getContiguousDataView(seq, HEADER_SIZE);
    if (view !== null) {
        return readHeaderView(view);
    }
    const bytes = ring.readBytes(seq, HEADER_SIZE);
    return readHeaderView(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
}
function writeHeaderView(view: DataView, header: FrameHeader): void {
    view.setUint32(0, header.magic, true);
    view.setUint16(4, header.version, true);
    view.setUint16(6, header.opcode, true);
    view.setUint32(8, header.flags, true);
    view.setUint32(12, header.requestId, true);
    view.setUint32(16, header.methodId, true);
    view.setInt32(20, header.statusCode, true);
    view.setUint32(24, header.payloadLength, true);
    view.setUint32(28, header.reserved, true);
}
function readHeaderView(view: DataView): FrameHeader {
    return {
        magic: view.getUint32(0, true),
        version: view.getUint16(4, true),
        opcode: view.getUint16(6, true) as Opcode,
        flags: view.getUint32(8, true),
        requestId: view.getUint32(12, true),
        methodId: view.getUint32(16, true),
        statusCode: view.getInt32(20, true),
        payloadLength: view.getUint32(24, true),
        reserved: view.getUint32(28, true),
    };
}
function validateFrameHeader(header: FrameHeader, capacityBytes: number): ValidatedFrameHeaderResult {
    if (header.magic !== FRAME_MAGIC) {
        throw new ShirikaProtocolError(`Invalid frame magic 0x${header.magic.toString(16)}`);
    }
    if (header.version !== FRAME_VERSION) {
        throw new ShirikaProtocolError(`Unsupported frame version ${header.version}`);
    }
    if (!isOpcode(header.opcode)) {
        throw new ShirikaProtocolError(`Unsupported opcode ${Number(header.opcode)}`);
    }
    const frameSize = frameSizeForPayloadLength(header.payloadLength, capacityBytes, 'receive');
    return {
        header: header as ValidatedFrameHeader,
        frameSize,
        payloadLength: header.payloadLength,
        paddingLength: frameSize - HEADER_SIZE - header.payloadLength,
    };
}
function frameSizeForPayloadLength(payloadLength: number, capacityBytes: number, direction: 'send' | 'receive'): number {
    if (!Number.isInteger(payloadLength) || payloadLength < 0) {
        const message = `Invalid payloadLength=${payloadLength}; payload length must be a non-negative integer`;
        if (direction === 'send') {
            throw new ShirikaProtocolError(message);
        }
        throw new ShirikaProtocolError(message);
    }
    const maxPayloadLength = capacityBytes - HEADER_SIZE;
    if (payloadLength > maxPayloadLength) {
        const frameSize = `${HEADER_SIZE}+${payloadLength}`;
        const message = `Invalid payloadLength=${payloadLength}; frameSize=${frameSize} exceeds capacity=${capacityBytes}`;
        if (direction === 'send') {
            throw new ShirikaOversizeError(message);
        }
        throw new ShirikaProtocolError(message);
    }
    return align8(HEADER_SIZE + payloadLength);
}
function assertUInt32(value: number, label: string): void {
    if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
        throw new ShirikaProtocolError(`${label} must be a UInt32 value in range 0..${UINT32_MAX}, received ${value}`);
    }
}
function isOpcode(opcode: number): opcode is Opcode {
    return (
        opcode === Opcode.REQUEST ||
        opcode === Opcode.RESPONSE_OK ||
        opcode === Opcode.RESPONSE_ERR ||
        opcode === Opcode.NOTIFY ||
        opcode === Opcode.CLOSE ||
        opcode === Opcode.CANCEL
    );
}
