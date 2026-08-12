import { ShirikaProtocolError } from '../errors.js';
import { decodeUtf8 } from '../utf8.js';
import type { BinaryReader } from './types.js';

export class ByteArrayBinaryReader implements BinaryReader {
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
        return this.#view.getUint16(this.take(2), true);
    }

    readU32(): number {
        return this.#view.getUint32(this.take(4), true);
    }

    readI32(): number {
        return this.#view.getInt32(this.take(4), true);
    }

    readF64(): number {
        return this.#view.getFloat64(this.take(8), true);
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

    private take(size: number): number {
        this.ensureCapacity(size);
        const offset = this.#offset;
        this.#offset += size;
        return offset;
    }

    private ensureCapacity(requiredBytes: number): void {
        if (requiredBytes > this.remainingBytes) {
            throw new ShirikaProtocolError(`Binary reader underflow: need ${requiredBytes} bytes with only ${this.remainingBytes} bytes remaining`);
        }
    }
}
