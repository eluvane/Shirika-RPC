import { defineCodecSignature } from './signature.js';
import type { BinaryReader, BinaryWriter, MsgpackCodec } from './types.js';

enum Marker {
    NIL = 0xc0,
    FALSE = 0xc2,
    TRUE = 0xc3,
    BIN8 = 0xc4,
    BIN16 = 0xc5,
    BIN32 = 0xc6,
    FLOAT64 = 0xcb,
    UINT8 = 0xcc,
    UINT16 = 0xcd,
    UINT32 = 0xce,
    INT8 = 0xd0,
    INT16 = 0xd1,
    INT32 = 0xd2,
    STR8 = 0xd9,
    STR16 = 0xda,
    STR32 = 0xdb,
    ARRAY16 = 0xdc,
    ARRAY32 = 0xdd,
    MAP16 = 0xde,
    MAP32 = 0xdf,
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const STRING_BYTE_CACHE_MAX_LENGTH = 64;
const STRING_BYTE_CACHE_MAX_ENTRIES = 256;
const stringByteCache = new Map<string, Uint8Array>();
const floatScratch = new Uint8Array(8);
const floatScratchView = new DataView(floatScratch.buffer);
const MAX_MSGPACK_CONTAINER_LENGTH = 1_000_000;

function isArrayBufferLike(value: unknown): value is ArrayBuffer | SharedArrayBuffer {
    return value instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer);
}

export function msgpack<T>(): MsgpackCodec<T> {
    return defineCodecSignature<MsgpackCodec<T>>(
        {
            kind: 'msgpack',
            encode(value) {
                const writer = new ByteArrayBinaryWriter(measureMsgpackValue(value));
                writeMsgpackValue(writer, value);
                return writer.finish();
            },
            decode(bytes) {
                const reader = new ByteArrayBinaryReader(bytes);
                const value = readMsgpackValue(reader) as T;
                reader.assertFullyRead();
                return value;
            },
            measure(value) {
                return measureMsgpackValue(value);
            },
            write(writer, value) {
                writeMsgpackValue(writer, value);
            },
            read(reader) {
                return readMsgpackValue(reader) as T;
            },
        },
        'msgpack',
    );
}

function measureMsgpackValue(value: unknown): number {
    if (value === null || value === undefined || typeof value === 'boolean') {
        return 1;
    }
    if (typeof value === 'number') {
        return measureNumber(value);
    }
    if (typeof value === 'string') {
        const byteLength = getUtf8Bytes(value).byteLength;
        return measureStringHeader(byteLength) + byteLength;
    }
    if (value instanceof Uint8Array) {
        return measureBinaryHeader(value.byteLength) + value.byteLength;
    }
    if (ArrayBuffer.isView(value) && value.constructor !== DataView) {
        const view = value as ArrayBufferView;
        return measureBinaryHeader(view.byteLength) + view.byteLength;
    }
    if (isArrayBufferLike(value)) {
        return measureBinaryHeader(value.byteLength) + value.byteLength;
    }
    if (Array.isArray(value)) {
        let size = measureArrayHeader(value.length);
        for (const item of value) {
            size += measureMsgpackValue(item);
        }
        return size;
    }
    if (typeof value === 'object') {
        return measureObject(value as Record<string, unknown>);
    }
    throw new TypeError(`Unsupported msgpack value type: ${typeof value}`);
}

function writeMsgpackValue(writer: BinaryWriter, value: unknown): void {
    if (value === null || value === undefined) {
        writer.writeU8(Marker.NIL);
        return;
    }
    if (typeof value === 'boolean') {
        writer.writeU8(value ? Marker.TRUE : Marker.FALSE);
        return;
    }
    if (typeof value === 'number') {
        writeNumber(writer, value);
        return;
    }
    if (typeof value === 'string') {
        writeString(writer, value);
        return;
    }
    if (value instanceof Uint8Array) {
        writeBinary(writer, value);
        return;
    }
    if (ArrayBuffer.isView(value) && value.constructor !== DataView) {
        const view = value as ArrayBufferView;
        writeBinary(writer, new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
        return;
    }
    if (isArrayBufferLike(value)) {
        writeBinary(writer, new Uint8Array(value));
        return;
    }
    if (Array.isArray(value)) {
        writeArrayHeader(writer, value.length);
        for (const item of value) {
            writeMsgpackValue(writer, item);
        }
        return;
    }
    if (typeof value === 'object') {
        writeObject(writer, value as Record<string, unknown>);
        return;
    }
    throw new TypeError(`Unsupported msgpack value type: ${typeof value}`);
}

function readMsgpackValue(reader: BinaryReader): unknown {
    const marker = reader.readU8();
    if (marker <= 0x7f) {
        return marker;
    }
    if (marker >= 0xe0) {
        return marker - 0x100;
    }
    if ((marker & 0xe0) === 0xa0) {
        return readStringBytes(reader, marker & 0x1f);
    }
    if ((marker & 0xf0) === 0x90) {
        return readArray(reader, marker & 0x0f);
    }
    if ((marker & 0xf0) === 0x80) {
        return readMap(reader, marker & 0x0f);
    }
    switch (marker) {
        case Marker.NIL:
            return null;
        case Marker.FALSE:
            return false;
        case Marker.TRUE:
            return true;
        case Marker.UINT8:
            return reader.readU8();
        case Marker.UINT16:
            return readU16BE(reader);
        case Marker.UINT32:
            return readU32BE(reader);
        case Marker.INT8: {
            const value = reader.readU8();
            return value > 0x7f ? value - 0x100 : value;
        }
        case Marker.INT16: {
            const value = readU16BE(reader);
            return value > 0x7fff ? value - 0x1_0000 : value;
        }
        case Marker.INT32:
            return readI32BE(reader);
        case Marker.FLOAT64: {
            const bytes = reader.readBytes(8);
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            return view.getFloat64(0, false);
        }
        case Marker.BIN8:
            return reader.readBytes(reader.readU8());
        case Marker.BIN16:
            return reader.readBytes(readU16BE(reader));
        case Marker.BIN32:
            return reader.readBytes(readU32BE(reader));
        case Marker.STR8:
            return readStringBytes(reader, reader.readU8());
        case Marker.STR16:
            return readStringBytes(reader, readU16BE(reader));
        case Marker.STR32:
            return readStringBytes(reader, readU32BE(reader));
        case Marker.ARRAY16:
            return readArray(reader, readU16BE(reader));
        case Marker.ARRAY32:
            return readArray(reader, readU32BE(reader));
        case Marker.MAP16:
            return readMap(reader, readU16BE(reader));
        case Marker.MAP32:
            return readMap(reader, readU32BE(reader));
        default:
            throw new TypeError(`Unsupported msgpack marker 0x${marker.toString(16)}`);
    }
}

function measureObject(value: Record<string, unknown>): number {
    const keys = Object.keys(value);
    let entryCount = 0;
    let entriesSize = 0;
    for (const key of keys) {
        const entryValue = value[key];
        if (entryValue === undefined) {
            continue;
        }
        entryCount += 1;
        const keyByteLength = getUtf8Bytes(key).byteLength;
        entriesSize += measureStringHeader(keyByteLength) + keyByteLength + measureMsgpackValue(entryValue);
    }
    return measureMapHeader(entryCount) + entriesSize;
}

function writeObject(writer: BinaryWriter, value: Record<string, unknown>): void {
    const keys = Object.keys(value);
    let entryCount = 0;
    for (const key of keys) {
        if (value[key] !== undefined) {
            entryCount += 1;
        }
    }
    writeMapHeader(writer, entryCount);
    for (const key of keys) {
        const entryValue = value[key];
        if (entryValue === undefined) {
            continue;
        }
        writeString(writer, key);
        writeMsgpackValue(writer, entryValue);
    }
}

function getUtf8Bytes(value: string): Uint8Array {
    if (value.length > STRING_BYTE_CACHE_MAX_LENGTH) {
        return textEncoder.encode(value);
    }
    const cached = stringByteCache.get(value);
    if (cached !== undefined) {
        return cached;
    }
    const bytes = textEncoder.encode(value);
    if (stringByteCache.size >= STRING_BYTE_CACHE_MAX_ENTRIES) {
        stringByteCache.clear();
    }
    stringByteCache.set(value, bytes);
    return bytes;
}

function measureNumber(value: number): number {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
        return 9;
    }
    if (value >= 0) {
        if (value <= 0x7f) {
            return 1;
        }
        if (value <= 0xff) {
            return 2;
        }
        if (value <= 0xffff) {
            return 3;
        }
        if (value <= 0xffff_ffff) {
            return 5;
        }
        return 9;
    }
    if (value >= -32) {
        return 1;
    }
    if (value >= -0x80) {
        return 2;
    }
    if (value >= -0x8000) {
        return 3;
    }
    if (value >= -0x8000_0000) {
        return 5;
    }
    return 9;
}

function writeNumber(writer: BinaryWriter, value: number): void {
    if (!Number.isFinite(value) || !Number.isInteger(value)) {
        writer.writeU8(Marker.FLOAT64);
        floatScratchView.setFloat64(0, value, false);
        writer.writeBytes(floatScratch);
        return;
    }
    if (value >= 0) {
        if (value <= 0x7f) {
            writer.writeU8(value);
            return;
        }
        if (value <= 0xff) {
            writer.writeU8(Marker.UINT8);
            writer.writeU8(value);
            return;
        }
        if (value <= 0xffff) {
            writer.writeU8(Marker.UINT16);
            writeU16BE(writer, value);
            return;
        }
        if (value <= 0xffff_ffff) {
            writer.writeU8(Marker.UINT32);
            writeU32BE(writer, value);
            return;
        }
    } else {
        if (value >= -32) {
            writer.writeU8(0x100 + value);
            return;
        }
        if (value >= -0x80) {
            writer.writeU8(Marker.INT8);
            writer.writeU8(value & 0xff);
            return;
        }
        if (value >= -0x8000) {
            writer.writeU8(Marker.INT16);
            writeU16BE(writer, value & 0xffff);
            return;
        }
        if (value >= -0x8000_0000) {
            writer.writeU8(Marker.INT32);
            writeU32BE(writer, value >>> 0);
            return;
        }
    }
    writer.writeU8(Marker.FLOAT64);
    floatScratchView.setFloat64(0, value, false);
    writer.writeBytes(floatScratch);
}

function measureStringHeader(byteLength: number): number {
    if (byteLength <= 31) {
        return 1;
    }
    if (byteLength <= 0xff) {
        return 2;
    }
    if (byteLength <= 0xffff) {
        return 3;
    }
    return 5;
}

function writeString(writer: BinaryWriter, value: string): void {
    const bytes = getUtf8Bytes(value);
    const length = bytes.byteLength;
    if (length <= 31) {
        writer.writeU8(0xa0 | length);
    } else if (length <= 0xff) {
        writer.writeU8(Marker.STR8);
        writer.writeU8(length);
    } else if (length <= 0xffff) {
        writer.writeU8(Marker.STR16);
        writeU16BE(writer, length);
    } else {
        writer.writeU8(Marker.STR32);
        writeU32BE(writer, length);
    }
    writer.writeBytes(bytes);
}

function readStringBytes(reader: BinaryReader, byteLength: number): string {
    if (byteLength === 0) {
        return '';
    }
    return textDecoder.decode(reader.readBytes(byteLength));
}

function measureBinaryHeader(byteLength: number): number {
    if (byteLength <= 0xff) {
        return 2;
    }
    if (byteLength <= 0xffff) {
        return 3;
    }
    return 5;
}

function writeBinary(writer: BinaryWriter, bytes: Uint8Array): void {
    if (bytes.byteLength <= 0xff) {
        writer.writeU8(Marker.BIN8);
        writer.writeU8(bytes.byteLength);
    } else if (bytes.byteLength <= 0xffff) {
        writer.writeU8(Marker.BIN16);
        writeU16BE(writer, bytes.byteLength);
    } else {
        writer.writeU8(Marker.BIN32);
        writeU32BE(writer, bytes.byteLength);
    }
    writer.writeBytes(bytes);
}

function measureArrayHeader(length: number): number {
    if (length <= 15) {
        return 1;
    }
    if (length <= 0xffff) {
        return 3;
    }
    return 5;
}

function writeArrayHeader(writer: BinaryWriter, length: number): void {
    if (length <= 15) {
        writer.writeU8(0x90 | length);
    } else if (length <= 0xffff) {
        writer.writeU8(Marker.ARRAY16);
        writeU16BE(writer, length);
    } else {
        writer.writeU8(Marker.ARRAY32);
        writeU32BE(writer, length);
    }
}

function readArray(reader: BinaryReader, length: number): unknown[] {
    assertContainerLength(reader, 'array', length, 1);
    const result: unknown[] = Array.from({ length });
    for (let index = 0; index < length; index += 1) {
        result[index] = readMsgpackValue(reader);
    }
    return result;
}

function assertContainerLength(reader: BinaryReader, kind: 'array' | 'map', length: number, minimumBytesPerEntry: number): void {
    if (length > MAX_MSGPACK_CONTAINER_LENGTH) {
        throw new RangeError(`Msgpack ${kind} length ${length} exceeds maximum ${MAX_MSGPACK_CONTAINER_LENGTH}`);
    }
    if (length * minimumBytesPerEntry > reader.remainingBytes) {
        throw new RangeError(`Msgpack ${kind} length ${length} exceeds remaining payload`);
    }
}

function measureMapHeader(length: number): number {
    if (length <= 15) {
        return 1;
    }
    if (length <= 0xffff) {
        return 3;
    }
    return 5;
}

function writeMapHeader(writer: BinaryWriter, length: number): void {
    if (length <= 15) {
        writer.writeU8(0x80 | length);
    } else if (length <= 0xffff) {
        writer.writeU8(Marker.MAP16);
        writeU16BE(writer, length);
    } else {
        writer.writeU8(Marker.MAP32);
        writeU32BE(writer, length);
    }
}

function readMap(reader: BinaryReader, length: number): Record<string, unknown> {
    assertContainerLength(reader, 'map', length, 2);
    const result: Record<string, unknown> = {};
    for (let index = 0; index < length; index += 1) {
        result[String(readMsgpackValue(reader))] = readMsgpackValue(reader);
    }
    return result;
}

function writeU16BE(writer: BinaryWriter, value: number): void {
    writer.writeU8((value >>> 8) & 0xff);
    writer.writeU8(value & 0xff);
}

function writeU32BE(writer: BinaryWriter, value: number): void {
    writer.writeU8((value >>> 24) & 0xff);
    writer.writeU8((value >>> 16) & 0xff);
    writer.writeU8((value >>> 8) & 0xff);
    writer.writeU8(value & 0xff);
}

function readU16BE(reader: BinaryReader): number {
    return (reader.readU8() << 8) | reader.readU8();
}

function readU32BE(reader: BinaryReader): number {
    return (reader.readU8() * 0x1_00_00_00 + (reader.readU8() << 16) + (reader.readU8() << 8) + reader.readU8()) >>> 0;
}

function readI32BE(reader: BinaryReader): number {
    return readU32BE(reader) | 0;
}

class ByteArrayBinaryWriter implements BinaryWriter {
    readonly #bytes: Uint8Array;
    #offset = 0;
    constructor(byteLength: number) {
        this.#bytes = new Uint8Array(byteLength);
    }
    get remainingBytes(): number {
        return this.#bytes.byteLength - this.#offset;
    }
    writeU8(value: number): void {
        this.ensureCapacity(1);
        this.#bytes[this.#offset] = value & 0xff;
        this.#offset += 1;
    }
    writeU16(value: number): void {
        this.writeU8(value & 0xff);
        this.writeU8((value >>> 8) & 0xff);
    }
    writeU32(value: number): void {
        this.writeU8(value & 0xff);
        this.writeU8((value >>> 8) & 0xff);
        this.writeU8((value >>> 16) & 0xff);
        this.writeU8((value >>> 24) & 0xff);
    }
    writeI32(value: number): void {
        this.writeU32(value >>> 0);
    }
    writeF64(value: number): void {
        floatScratchView.setFloat64(0, value, true);
        this.writeBytes(floatScratch);
    }
    writeBool(value: boolean): void {
        this.writeU8(value ? 1 : 0);
    }
    writeBytes(value: Uint8Array): void {
        this.ensureCapacity(value.byteLength);
        this.#bytes.set(value, this.#offset);
        this.#offset += value.byteLength;
    }
    writeStringUtf8(value: string): void {
        this.writeVarBytes(textEncoder.encode(value));
    }
    writeVarBytes(value: Uint8Array): void {
        this.writeU32(value.byteLength);
        this.writeBytes(value);
    }
    writeArrayHeader(length: number): void {
        this.writeU32(length);
    }
    finish(): Uint8Array {
        if (this.#offset !== this.#bytes.byteLength) {
            throw new TypeError(`Msgpack writer produced ${this.#offset} bytes, expected ${this.#bytes.byteLength}`);
        }
        return this.#bytes;
    }
    private ensureCapacity(requiredBytes: number): void {
        if (requiredBytes > this.remainingBytes) {
            throw new TypeError(`Msgpack writer overflow: need ${requiredBytes} bytes with only ${this.remainingBytes} bytes remaining`);
        }
    }
}

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
        return byteLength === 0 ? '' : textDecoder.decode(this.readBytes(byteLength));
    }
    readVarBytes(): Uint8Array {
        return this.readBytes(this.readU32());
    }
    readArrayHeader(): number {
        return this.readU32();
    }
    assertFullyRead(): void {
        if (this.#offset !== this.#bytes.byteLength) {
            throw new TypeError(`Msgpack reader consumed ${this.#offset} bytes, expected ${this.#bytes.byteLength}`);
        }
    }
    private ensureCapacity(requiredBytes: number): void {
        if (requiredBytes > this.remainingBytes) {
            throw new TypeError(`Msgpack reader underflow: need ${requiredBytes} bytes with only ${this.remainingBytes} bytes remaining`);
        }
    }
}
