import type { BinaryWriter } from '../codec/types.js';
import { ShirikaProtocolError } from '../errors.js';
import { utf8ByteLength } from '../utf8.js';
import { u32 } from '../utils.js';
import type { SharedRingBuffer } from './shared-ring.js';
export class RingBinaryWriter implements BinaryWriter {
    readonly #ring: SharedRingBuffer;
    readonly #limitBytes: number;
    #cursorSeq: number;
    #writtenBytes = 0;
    readonly #scratch = new Uint8Array(8);
    readonly #scratchView = new DataView(this.#scratch.buffer);
    constructor(ring: SharedRingBuffer, startSeq: number, payloadLength: number) {
        this.#ring = ring;
        this.#cursorSeq = startSeq;
        this.#limitBytes = payloadLength;
    }
    get remainingBytes(): number {
        return this.#limitBytes - this.#writtenBytes;
    }
    get writtenBytes(): number {
        return this.#writtenBytes;
    }
    writeU8(value: number): void {
        this.ensureCapacity(1);
        this.#ring.writeByte(this.#cursorSeq, value);
        this.advance(1);
    }
    writeU16(value: number): void {
        this.ensureCapacity(2);
        this.#scratchView.setUint16(0, value, true);
        this.#ring.writeBytes(this.#cursorSeq, this.#scratch, 0, 2);
        this.advance(2);
    }
    writeU32(value: number): void {
        this.ensureCapacity(4);
        this.#scratchView.setUint32(0, u32(value), true);
        this.#ring.writeBytes(this.#cursorSeq, this.#scratch, 0, 4);
        this.advance(4);
    }
    writeI32(value: number): void {
        this.ensureCapacity(4);
        this.#scratchView.setInt32(0, value, true);
        this.#ring.writeBytes(this.#cursorSeq, this.#scratch, 0, 4);
        this.advance(4);
    }
    writeF64(value: number): void {
        this.ensureCapacity(8);
        this.#scratchView.setFloat64(0, value, true);
        this.#ring.writeBytes(this.#cursorSeq, this.#scratch, 0, 8);
        this.advance(8);
    }
    writeBool(value: boolean): void {
        this.writeU8(value ? 1 : 0);
    }
    writeBytes(value: Uint8Array): void {
        this.ensureCapacity(value.byteLength);
        this.#ring.writeBytes(this.#cursorSeq, value);
        this.advance(value.byteLength);
    }
    writeStringUtf8(value: string): void {
        const byteLength = utf8ByteLength(value);
        this.writeU32(byteLength);
        this.ensureCapacity(byteLength);
        this.#ring.writeUtf8(this.#cursorSeq, value, byteLength);
        this.advance(byteLength);
    }
    writeVarBytes(value: Uint8Array): void {
        this.writeU32(value.byteLength);
        this.writeBytes(value);
    }
    writeArrayHeader(length: number): void {
        this.writeU32(length);
    }
    finish(): void {
        if (this.#writtenBytes !== this.#limitBytes) {
            throw new ShirikaProtocolError(`Binary writer did not fill payload exactly: expected ${this.#limitBytes}, wrote ${this.#writtenBytes}`);
        }
    }
    private ensureCapacity(requiredBytes: number): void {
        if (requiredBytes > this.remainingBytes) {
            throw new ShirikaProtocolError(`Binary writer overflow: need ${requiredBytes} bytes with only ${this.remainingBytes} bytes remaining`);
        }
    }
    private advance(delta: number): void {
        this.#cursorSeq = u32(this.#cursorSeq + delta);
        this.#writtenBytes += delta;
    }
}

export interface TrustedMeasuredRingBinaryWriter extends BinaryWriter {
    readonly writtenBytes: number;
    finish(): void;
}

/**
 * UNSAFE: creates a writer that trusts a prepared codec's measured budget.
 *
 * Safety precondition: the caller must have selected a `PreparedBinaryCodec` whose witness accepts
 * the concrete value being written, and `payloadLength` must be the result of that codec's trusted
 * `measure(value)`. This writer skips the per-primitive `ensureCapacity()` checks only; `finish()`
 * remains live so tests and development runs still catch a measure/write mismatch before commit.
 */
export function unsafeCreateTrustedMeasuredRingBinaryWriter(ring: SharedRingBuffer, startSeq: number, payloadLength: number): TrustedMeasuredRingBinaryWriter {
    return new UncheckedMeasuredRingBinaryWriter(ring, startSeq, payloadLength);
}

class UncheckedMeasuredRingBinaryWriter implements TrustedMeasuredRingBinaryWriter {
    readonly #ring: SharedRingBuffer;
    readonly #limitBytes: number;
    #cursorSeq: number;
    #writtenBytes = 0;
    readonly #scratch = new Uint8Array(8);
    readonly #scratchView = new DataView(this.#scratch.buffer);
    constructor(ring: SharedRingBuffer, startSeq: number, payloadLength: number) {
        this.#ring = ring;
        this.#cursorSeq = startSeq;
        this.#limitBytes = payloadLength;
    }
    get remainingBytes(): number {
        return this.#limitBytes - this.#writtenBytes;
    }
    get writtenBytes(): number {
        return this.#writtenBytes;
    }
    writeU8(value: number): void {
        this.#ring.writeByte(this.#cursorSeq, value);
        this.advance(1);
    }
    writeU16(value: number): void {
        this.#scratchView.setUint16(0, value, true);
        this.#ring.writeBytes(this.#cursorSeq, this.#scratch, 0, 2);
        this.advance(2);
    }
    writeU32(value: number): void {
        this.#scratchView.setUint32(0, u32(value), true);
        this.#ring.writeBytes(this.#cursorSeq, this.#scratch, 0, 4);
        this.advance(4);
    }
    writeI32(value: number): void {
        this.#scratchView.setInt32(0, value, true);
        this.#ring.writeBytes(this.#cursorSeq, this.#scratch, 0, 4);
        this.advance(4);
    }
    writeF64(value: number): void {
        this.#scratchView.setFloat64(0, value, true);
        this.#ring.writeBytes(this.#cursorSeq, this.#scratch, 0, 8);
        this.advance(8);
    }
    writeBool(value: boolean): void {
        this.writeU8(value ? 1 : 0);
    }
    writeBytes(value: Uint8Array): void {
        this.#ring.writeBytes(this.#cursorSeq, value);
        this.advance(value.byteLength);
    }
    writeStringUtf8(value: string): void {
        const byteLength = utf8ByteLength(value);
        this.writeU32(byteLength);
        this.#ring.writeUtf8(this.#cursorSeq, value, byteLength);
        this.advance(byteLength);
    }
    writeVarBytes(value: Uint8Array): void {
        this.writeU32(value.byteLength);
        this.writeBytes(value);
    }
    writeArrayHeader(length: number): void {
        this.writeU32(length);
    }
    finish(): void {
        if (this.#writtenBytes !== this.#limitBytes) {
            throw new ShirikaProtocolError(`Binary writer did not fill payload exactly: expected ${this.#limitBytes}, wrote ${this.#writtenBytes}`);
        }
    }
    private advance(delta: number): void {
        this.#cursorSeq = u32(this.#cursorSeq + delta);
        this.#writtenBytes += delta;
    }
}
