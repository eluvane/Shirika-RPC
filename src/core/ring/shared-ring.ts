import { throwIfAborted } from '../abort.js';
import { ControlIndex, NORMALIZE_THRESHOLD, TransportErrorHint, TransportState } from '../constants.js';
import { ShirikaClosedError, ShirikaOversizeError, ShirikaProtocolError, ShirikaTimeoutError } from '../errors.js';
import { encodeUtf8, encodeUtf8Into } from '../utf8.js';
import { deadlineFromTimeout, remainingTimeout, u32 } from '../utils.js';
import type { WaitStrategy } from '../wait.js';
import type { RingLayout } from './layout.js';

type NodeBufferView = Uint8Array & {
    copy(target: Uint8Array, targetStart?: number, sourceStart?: number, sourceEnd?: number): number;
};
interface NodeBufferConstructorLike {
    from(buffer: ArrayBufferLike, byteOffset?: number, length?: number): NodeBufferView;
    allocUnsafe?(size: number): NodeBufferView;
}
const NODE_BUFFER_WRITE_THRESHOLD_BYTES = 64 * 1024;
const READ_INTO_COPY_MIN_BYTES = 2 * 1024 * 1024;
const READ_INTO_COPY_MAX_BYTES = 16 * 1024 * 1024;
const UNSAFE_READ_TARGET_MIN_BYTES = 2 * 1024 * 1024;
const UNSAFE_READ_TARGET_MAX_BYTES = 16 * 1024 * 1024;
const nodeBufferConstructor = (() => {
    // SAFETY: Buffer is a Node-only global and this structural probe only reads its constructor shape.
    const candidate = (globalThis as unknown as { readonly Buffer?: NodeBufferConstructorLike }).Buffer;
    return typeof candidate?.from === 'function' ? candidate : undefined;
})();
function writeChunkWithNodeBuffer(source: Uint8Array, sourceOffset: number, target: Uint8Array, targetOffset: number, length: number): boolean {
    if (nodeBufferConstructor === undefined) {
        return false;
    }
    const sourceBuffer = nodeBufferConstructor.from(source.buffer, source.byteOffset + sourceOffset, length);
    const targetBuffer = nodeBufferConstructor.from(target.buffer, target.byteOffset, target.byteLength);
    sourceBuffer.copy(targetBuffer, targetOffset, 0, length);
    return true;
}
function createReadTarget(byteLength: number): Uint8Array {
    // SAFETY: the returned target is immediately and completely overwritten by readInto/readBytes before exposure.
    const unsafeBuffer =
        byteLength >= UNSAFE_READ_TARGET_MIN_BYTES && byteLength <= UNSAFE_READ_TARGET_MAX_BYTES ? nodeBufferConstructor?.allocUnsafe?.(byteLength) : undefined;
    if (unsafeBuffer === undefined) {
        return new Uint8Array(byteLength);
    }
    return new Uint8Array(unsafeBuffer.buffer, unsafeBuffer.byteOffset, unsafeBuffer.byteLength);
}
export interface RingSnapshot {
    readonly label: string;
    readonly capacityBytes: number;
    readonly state: TransportState;
    readonly lastError: number;
    readonly readSeq: number;
    readonly writeSeq: number;
    readonly usedBytes: number;
    readonly freeBytes: number;
    readonly saturation: number;
}
export class SharedRingBuffer {
    readonly control: Int32Array;
    readonly data: Uint8Array;
    readonly capacityBytes: number;
    readonly waitStrategy: WaitStrategy;
    readonly label: string;
    constructor(layout: RingLayout, waitStrategy: WaitStrategy, label: string) {
        this.control = layout.control;
        this.data = layout.data;
        this.capacityBytes = layout.capacityBytes;
        this.waitStrategy = waitStrategy;
        this.label = label;
    }
    loadState(): TransportState {
        return Atomics.load(this.control, ControlIndex.STATE) as TransportState;
    }
    loadLastError(): number {
        return Atomics.load(this.control, ControlIndex.LAST_ERROR);
    }
    markClosing(): void {
        this.updateState(TransportState.CLOSING);
        this.wakeAll();
    }
    markClosed(errorHint: number = TransportErrorHint.CLOSED): void {
        Atomics.store(this.control, ControlIndex.LAST_ERROR, errorHint);
        this.updateState(TransportState.CLOSED);
        this.wakeAll();
    }
    markErrored(errorHint: number = TransportErrorHint.PROTOCOL): void {
        Atomics.store(this.control, ControlIndex.LAST_ERROR, errorHint);
        this.updateState(TransportState.ERRORED);
        this.wakeAll();
    }
    wakeAll(): void {
        Atomics.add(this.control, ControlIndex.DATA_SEQ, 1);
        Atomics.notify(this.control, ControlIndex.DATA_SEQ);
        Atomics.add(this.control, ControlIndex.SPACE_SEQ, 1);
        Atomics.notify(this.control, ControlIndex.SPACE_SEQ);
    }
    toOffset(seq: number): number {
        return u32(seq) & (this.capacityBytes - 1);
    }
    getContiguousReadableView(seq: number, length: number): Uint8Array | null {
        const offset = this.contiguousOffset(seq, length);
        return offset === undefined ? null : this.data.subarray(offset, offset + length);
    }
    getContiguousWritableView(seq: number, length: number): Uint8Array | null {
        return this.getContiguousReadableView(seq, length);
    }
    getContiguousDataView(seq: number, length: number): DataView | null {
        const offset = this.contiguousOffset(seq, length);
        return offset === undefined ? null : new DataView(this.data.buffer, this.data.byteOffset + offset, length);
    }
    private contiguousOffset(seq: number, length: number): number | undefined {
        const offset = this.toOffset(seq);
        return offset + length > this.capacityBytes ? undefined : offset;
    }
    writeByte(seq: number, value: number): void {
        this.data[this.toOffset(seq)] = value & 0xff;
    }
    readByte(seq: number): number {
        return this.data[this.toOffset(seq)] ?? 0;
    }
    writeBytes(seq: number, bytes: Uint8Array, sourceOffset = 0, length = bytes.byteLength - sourceOffset): void {
        if (length <= 0) {
            return;
        }
        const offset = this.toOffset(seq);
        const firstLength = Math.min(length, this.capacityBytes - offset);
        if (firstLength < NODE_BUFFER_WRITE_THRESHOLD_BYTES || !writeChunkWithNodeBuffer(bytes, sourceOffset, this.data, offset, firstLength)) {
            const firstChunk = sourceOffset === 0 && firstLength === bytes.byteLength ? bytes : bytes.subarray(sourceOffset, sourceOffset + firstLength);
            this.data.set(firstChunk, offset);
        }
        if (length > firstLength) {
            const secondOffset = sourceOffset + firstLength;
            const secondLength = length - firstLength;
            if (secondLength < NODE_BUFFER_WRITE_THRESHOLD_BYTES || !writeChunkWithNodeBuffer(bytes, secondOffset, this.data, 0, secondLength)) {
                this.data.set(bytes.subarray(secondOffset, sourceOffset + length), 0);
            }
        }
    }
    readBytes(seq: number, length: number): Uint8Array {
        if (length <= 0) {
            return new Uint8Array(0);
        }
        const offset = this.toOffset(seq);
        if ((length < READ_INTO_COPY_MIN_BYTES || length > READ_INTO_COPY_MAX_BYTES) && offset + length <= this.capacityBytes) {
            return this.data.slice(offset, offset + length);
        }
        const target = createReadTarget(length);
        this.readInto(seq, target, 0, length);
        return target;
    }
    readInto(seq: number, target: Uint8Array, targetOffset = 0, length = target.byteLength - targetOffset): void {
        if (length <= 0) {
            return;
        }
        const offset = this.toOffset(seq);
        const firstLength = Math.min(length, this.capacityBytes - offset);
        target.set(this.data.subarray(offset, offset + firstLength), targetOffset);
        if (length > firstLength) {
            target.set(this.data.subarray(0, length - firstLength), targetOffset + firstLength);
        }
    }
    zeroFill(seq: number, length: number): void {
        if (length <= 0) {
            return;
        }
        const offset = this.toOffset(seq);
        const firstLength = Math.min(length, this.capacityBytes - offset);
        this.data.fill(0, offset, offset + firstLength);
        if (length > firstLength) {
            this.data.fill(0, 0, length - firstLength);
        }
    }
    writeUtf8(seq: number, value: string, byteLength: number): void {
        if (byteLength === 0) {
            return;
        }
        const direct = this.getContiguousWritableView(seq, byteLength);
        if (direct !== null) {
            const result = encodeUtf8Into(value, direct);
            if (result.written === byteLength && result.read === value.length) {
                return;
            }
        }
        this.writeBytes(seq, encodeUtf8(value));
    }
    sampleUsedBytes(): number {
        const usedBytes = this.computeUsedBytes(
            u32(Atomics.load(this.control, ControlIndex.READ_SEQ)),
            u32(Atomics.load(this.control, ControlIndex.WRITE_SEQ)),
            true,
        );
        return usedBytes ?? 0;
    }
    snapshot(): RingSnapshot {
        while (true) {
            const seqs = this.loadSeqPairIfStable();
            if (seqs === undefined) {
                continue;
            }
            const usedBytes = this.computeUsedBytes(seqs.readSeq, seqs.writeSeq);
            return {
                label: this.label,
                capacityBytes: this.capacityBytes,
                state: this.loadState(),
                lastError: this.loadLastError(),
                readSeq: seqs.readSeq,
                writeSeq: seqs.writeSeq,
                usedBytes,
                freeBytes: this.capacityBytes - usedBytes,
                saturation: this.capacityBytes === 0 ? 0 : usedBytes / this.capacityBytes,
            };
        }
    }
    maybeNormalize(): void {
        const readSeq = u32(Atomics.load(this.control, ControlIndex.READ_SEQ));
        if (readSeq < NORMALIZE_THRESHOLD) {
            return;
        }
        const writeSeq = u32(Atomics.load(this.control, ControlIndex.WRITE_SEQ));
        if (readSeq !== writeSeq) {
            return;
        }
        if (Atomics.compareExchange(this.control, ControlIndex.RESERVED_0, 0, 1) !== 0) {
            return;
        }
        try {
            const currentReadSeq = u32(Atomics.load(this.control, ControlIndex.READ_SEQ));
            const currentWriteSeq = u32(Atomics.load(this.control, ControlIndex.WRITE_SEQ));
            if (currentReadSeq === currentWriteSeq && currentReadSeq >= NORMALIZE_THRESHOLD) {
                Atomics.store(this.control, ControlIndex.READ_SEQ, 0);
                Atomics.store(this.control, ControlIndex.WRITE_SEQ, 0);
                this.wakeAll();
            }
        } finally {
            Atomics.store(this.control, ControlIndex.RESERVED_0, 0);
        }
    }
    async waitForWritable(bytes: number, timeoutMs?: number, signal?: AbortSignal): Promise<number> {
        if (bytes > this.capacityBytes) {
            throw new ShirikaOversizeError(`Ring ${this.label} cannot fit frame of ${bytes} bytes in capacity ${this.capacityBytes}`);
        }
        return this.waitForSpace(
            ControlIndex.SPACE_SEQ,
            timeoutMs,
            signal,
            (seqs, usedBytes) => {
                this.assertWritable();
                return this.capacityBytes - usedBytes >= bytes ? seqs.writeSeq : undefined;
            },
            `Timed out waiting for free space on ring ${this.label}`,
            true,
        );
    }
    async waitForReadable(bytes: number, timeoutMs?: number, signal?: AbortSignal): Promise<number> {
        if (bytes > this.capacityBytes) {
            throw new ShirikaOversizeError(`Ring ${this.label} cannot read ${bytes} bytes from capacity ${this.capacityBytes}`);
        }
        return this.waitForSpace(
            ControlIndex.DATA_SEQ,
            timeoutMs,
            signal,
            (seqs, usedBytes) => {
                if (usedBytes >= bytes) {
                    return seqs.readSeq;
                }
                this.assertReadable(usedBytes);
                return undefined;
            },
            `Timed out waiting for data on ring ${this.label}`,
            false,
        );
    }
    readableBytesFrom(readSeq: number): number {
        return this.computeUsedBytes(u32(readSeq), u32(Atomics.load(this.control, ControlIndex.WRITE_SEQ)));
    }
    private async waitForSpace(
        waitIndex: number,
        timeoutMs: number | undefined,
        signal: AbortSignal | undefined,
        tryAcquire: (seqs: { readSeq: number; writeSeq: number }, usedBytes: number) => number | undefined,
        timeoutMessage: string,
        assertWritableFirst: boolean,
    ): Promise<number> {
        const deadline = deadlineFromTimeout(timeoutMs);
        while (true) {
            throwIfAborted(signal);
            if (assertWritableFirst) {
                this.assertWritable();
            }
            this.maybeNormalize();
            const expected = Atomics.load(this.control, waitIndex);
            const seqs = this.loadSeqPairIfStable();
            if (seqs === undefined) {
                continue;
            }
            const usedBytes = this.computeUsedBytes(seqs.readSeq, seqs.writeSeq);
            const acquired = tryAcquire(seqs, usedBytes);
            if (acquired !== undefined) {
                return acquired;
            }
            if (Atomics.load(this.control, waitIndex) !== expected) {
                continue;
            }
            const remaining = remainingTimeout(deadline);
            if (remaining !== undefined && remaining <= 0) {
                throw new ShirikaTimeoutError(timeoutMessage);
            }
            const result = await this.waitStrategy.wait(this.control, waitIndex, expected, remaining, signal);
            if (result === 'timed-out') {
                throw new ShirikaTimeoutError(timeoutMessage);
            }
        }
    }
    private loadSeqPairIfStable(): { readSeq: number; writeSeq: number } | undefined {
        if (Atomics.load(this.control, ControlIndex.RESERVED_0) !== 0) {
            return undefined;
        }
        const readSeq = u32(Atomics.load(this.control, ControlIndex.READ_SEQ));
        const writeSeq = u32(Atomics.load(this.control, ControlIndex.WRITE_SEQ));
        if (Atomics.load(this.control, ControlIndex.RESERVED_0) !== 0) {
            return undefined;
        }
        return { readSeq, writeSeq };
    }
    private computeUsedBytes(readSeq: number, writeSeq: number): number;
    private computeUsedBytes(readSeq: number, writeSeq: number, softOnNormalize: true): number | undefined;
    private computeUsedBytes(readSeq: number, writeSeq: number, softOnNormalize = false): number | undefined {
        const usedBytes = u32(writeSeq - readSeq);
        if (usedBytes <= this.capacityBytes) {
            return usedBytes;
        }
        if (softOnNormalize && Atomics.load(this.control, ControlIndex.RESERVED_0) !== 0) {
            return undefined;
        }
        this.markErrored(TransportErrorHint.PROTOCOL);
        throw new ShirikaProtocolError(`Ring ${this.label} observed invalid usedBytes=${usedBytes}, capacity=${this.capacityBytes}`);
    }
    commitWrite(nextWriteSeq: number): void {
        Atomics.store(this.control, ControlIndex.WRITE_SEQ, nextWriteSeq | 0);
        Atomics.add(this.control, ControlIndex.DATA_SEQ, 1);
        Atomics.notify(this.control, ControlIndex.DATA_SEQ, 1);
    }
    commitRead(nextReadSeq: number): void {
        Atomics.store(this.control, ControlIndex.READ_SEQ, nextReadSeq | 0);
        Atomics.add(this.control, ControlIndex.SPACE_SEQ, 1);
        Atomics.notify(this.control, ControlIndex.SPACE_SEQ, 1);
        if (u32(nextReadSeq) >= NORMALIZE_THRESHOLD) {
            this.maybeNormalize();
        }
    }
    private assertWritable(): void {
        const state = this.loadState();
        if (state === TransportState.OPEN) {
            return;
        }
        throw this.createTerminalError('write');
    }
    private assertReadable(usedBytes: number): void {
        const state = this.loadState();
        if (state === TransportState.OPEN || usedBytes > 0) {
            return;
        }
        throw this.createTerminalError('read');
    }
    private createTerminalError(action: string): ShirikaClosedError | ShirikaProtocolError {
        const state = this.loadState();
        if (state === TransportState.ERRORED) {
            return new ShirikaProtocolError(`Cannot ${action} on ring ${this.label}: transport errored (${this.loadLastError()})`);
        }
        return new ShirikaClosedError(`Cannot ${action} on ring ${this.label}: state=${state}`);
    }
    private updateState(nextState: TransportState): void {
        while (true) {
            const current = Atomics.load(this.control, ControlIndex.STATE) as TransportState;
            if (current >= nextState) {
                return;
            }
            if (Atomics.compareExchange(this.control, ControlIndex.STATE, current, nextState) === current) {
                return;
            }
        }
    }
}
