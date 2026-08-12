import type { BinaryReader } from '../codec/types.js';
import { ShirikaProtocolError } from '../errors.js';
import { decodeUtf8 } from '../utf8.js';
import { u32 } from '../utils.js';
import type { SharedRingBuffer } from './shared-ring.js';

export class RingBinaryReader implements BinaryReader {
    readonly #ring: SharedRingBuffer;
    readonly #limitBytes: number;
    #cursorSeq: number;
    #readBytes = 0;
    readonly #scratch = new Uint8Array(8);
    readonly #scratchView = new DataView(this.#scratch.buffer);
    constructor(ring: SharedRingBuffer, startSeq: number, payloadLength: number) {
        this.#ring = ring;
        this.#cursorSeq = startSeq;
        this.#limitBytes = payloadLength;
    }
    get remainingBytes(): number {
        return this.#limitBytes - this.#readBytes;
    }
    get readBytesCount(): number {
        return this.#readBytes;
    }
    readU8(): number {
        this.ensureCapacity(1);
        const value = this.#ring.readByte(this.#cursorSeq);
        this.advance(1);
        return value;
    }
    readU16(): number {
        return this.readScratch(2).getUint16(0, true);
    }
    readU32(): number {
        return this.readScratch(4).getUint32(0, true);
    }
    readI32(): number {
        return this.readScratch(4).getInt32(0, true);
    }
    readF64(): number {
        return this.readScratch(8).getFloat64(0, true);
    }
    readBool(): boolean {
        return this.readU8() !== 0;
    }
    readBytes(length: number): Uint8Array {
        this.ensureCapacity(length);
        const value = this.#ring.readBytes(this.#cursorSeq, length);
        this.advance(length);
        return value;
    }
    readStringUtf8(): string {
        const byteLength = this.readU32();
        if (byteLength === 0) {
            return '';
        }
        this.ensureCapacity(byteLength);
        const contiguous = this.#ring.getContiguousReadableView(this.#cursorSeq, byteLength);
        let value: string;
        if (contiguous !== null) {
            value = decodeUtf8(contiguous);
        } else {
            const bytes = new Uint8Array(byteLength);
            this.#ring.readInto(this.#cursorSeq, bytes, 0, byteLength);
            value = decodeUtf8(bytes);
        }
        this.advance(byteLength);
        return value;
    }
    readVarBytes(): Uint8Array {
        const byteLength = this.readU32();
        return this.readBytes(byteLength);
    }
    readArrayHeader(): number {
        return this.readU32();
    }
    assertFullyRead(): void {
        if (this.#readBytes !== this.#limitBytes) {
            throw new ShirikaProtocolError(`Binary reader did not consume payload exactly: expected ${this.#limitBytes}, read ${this.#readBytes}`);
        }
    }
    private readScratch(size: number): DataView {
        this.ensureCapacity(size);
        this.#ring.readInto(this.#cursorSeq, this.#scratch, 0, size);
        this.advance(size);
        return this.#scratchView;
    }
    private ensureCapacity(requiredBytes: number): void {
        if (requiredBytes > this.remainingBytes) {
            throw new ShirikaProtocolError(`Binary reader underflow: need ${requiredBytes} bytes with only ${this.remainingBytes} bytes remaining`);
        }
    }
    private advance(delta: number): void {
        this.#cursorSeq = u32(this.#cursorSeq + delta);
        this.#readBytes += delta;
    }
}
