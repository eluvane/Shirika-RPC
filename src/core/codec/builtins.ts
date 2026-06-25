import { utf8ByteLength } from '../utf8.js';
import { defineCodecSignature } from './signature.js';
import { getSpecializedReadSideStrategy } from './specialized-readers.js';
import type { BinaryCodec } from './types.js';
import { defineInternalCodecWitness } from './witness.js';

const voidCodec = defineInternalCodecWitness(
    defineCodecSignature<BinaryCodec<void>>(
        {
            kind: 'binary',
            measure: () => 0,
            write() {
                return undefined;
            },
            read() {
                return undefined;
            },
        },
        'void',
    ),
    {
        codecKind: 'primitive',
        signature: 'void',
        leanCodec: 'Shirika.Codec.Builtins.voidCodec',
        leanTheorems: ['Shirika.Codec.Builtins.void_lawful'],
        conformanceVectors: ['primitive-void'],
        readSideStrategy: getSpecializedReadSideStrategy('void'),
        acceptsMeasuredWriterValue: (value) => value === undefined,
    },
);
const boolCodec = defineInternalCodecWitness(
    defineCodecSignature<BinaryCodec<boolean>>(
        {
            kind: 'binary',
            measure: () => 1,
            write(writer, value) {
                writer.writeBool(value);
            },
            read(reader) {
                return reader.readBool();
            },
        },
        'bool',
    ),
    {
        codecKind: 'primitive',
        signature: 'bool',
        leanCodec: 'Shirika.Codec.Builtins.boolCodec',
        leanTheorems: ['Shirika.Codec.Builtins.bool_lawful'],
        conformanceVectors: ['primitive-bool'],
        readSideStrategy: getSpecializedReadSideStrategy('bool'),
    },
);
const u8Codec = defineInternalCodecWitness(
    defineCodecSignature<BinaryCodec<number>>(
        {
            kind: 'binary',
            measure: () => 1,
            write(writer, value) {
                writer.writeU8(value);
            },
            read(reader) {
                return reader.readU8();
            },
        },
        'u8',
    ),
    {
        codecKind: 'primitive',
        signature: 'u8',
        leanCodec: 'Shirika.Codec.Builtins.u8Codec',
        leanTheorems: ['Shirika.Codec.Builtins.u8_lawful'],
        conformanceVectors: ['primitive-u8'],
        readSideStrategy: getSpecializedReadSideStrategy('u8'),
        valueScope: 'bounded-primitive-values',
        acceptsMeasuredWriterValue: isU8Value,
    },
);
const u16Codec = defineInternalCodecWitness(
    defineCodecSignature<BinaryCodec<number>>(
        {
            kind: 'binary',
            measure: () => 2,
            write(writer, value) {
                writer.writeU16(value);
            },
            read(reader) {
                return reader.readU16();
            },
        },
        'u16',
    ),
    {
        codecKind: 'primitive',
        signature: 'u16',
        leanCodec: 'Shirika.Codec.Builtins.u16Codec',
        leanTheorems: ['Shirika.Codec.Builtins.u16_lawful'],
        conformanceVectors: ['primitive-u16'],
        readSideStrategy: getSpecializedReadSideStrategy('u16'),
        valueScope: 'bounded-primitive-values',
        acceptsMeasuredWriterValue: isU16Value,
    },
);
const u32Codec = defineInternalCodecWitness(
    defineCodecSignature<BinaryCodec<number>>(
        {
            kind: 'binary',
            measure: () => 4,
            write(writer, value) {
                writer.writeU32(value);
            },
            read(reader) {
                return reader.readU32();
            },
        },
        'u32',
    ),
    {
        codecKind: 'primitive',
        signature: 'u32',
        leanCodec: 'Shirika.Codec.Builtins.u32Codec',
        leanTheorems: ['Shirika.Codec.Builtins.u32_lawful'],
        conformanceVectors: ['primitive-u32'],
        readSideStrategy: getSpecializedReadSideStrategy('u32'),
        valueScope: 'bounded-primitive-values',
        acceptsMeasuredWriterValue: isU32Value,
    },
);
const i32Codec = defineInternalCodecWitness(
    defineCodecSignature<BinaryCodec<number>>(
        {
            kind: 'binary',
            measure: () => 4,
            write(writer, value) {
                writer.writeI32(value);
            },
            read(reader) {
                return reader.readI32();
            },
        },
        'i32',
    ),
    {
        codecKind: 'primitive',
        signature: 'i32',
        leanCodec: 'Shirika.Codec.Builtins.i32Codec',
        leanTheorems: ['Shirika.Codec.Builtins.i32_lawful'],
        conformanceVectors: ['primitive-i32'],
        readSideStrategy: getSpecializedReadSideStrategy('i32'),
        valueScope: 'bounded-primitive-values',
        acceptsMeasuredWriterValue: isI32Value,
    },
);
const f64Codec = defineCodecSignature<BinaryCodec<number>>(
    {
        kind: 'binary',
        measure: () => 8,
        write(writer, value) {
            writer.writeF64(value);
        },
        read(reader) {
            return reader.readF64();
        },
    },
    'f64',
);
const stringCodec = defineCodecSignature<BinaryCodec<string>>(
    {
        kind: 'binary',
        measure(value) {
            return 4 + utf8ByteLength(value);
        },
        write(writer, value) {
            writer.writeStringUtf8(value);
        },
        read(reader) {
            return reader.readStringUtf8();
        },
    },
    'string',
);
const bytesCodec = defineInternalCodecWitness(
    defineCodecSignature<BinaryCodec<Uint8Array>>(
        {
            kind: 'binary',
            measure(value) {
                return 4 + value.byteLength;
            },
            write(writer, value) {
                writer.writeVarBytes(value);
            },
            read(reader) {
                return reader.readVarBytes();
            },
        },
        'bytes',
    ),
    {
        codecKind: 'bytes',
        signature: 'bytes',
        leanCodec: 'Shirika.Codec.Builtins.bytesCodec',
        leanTheorems: ['Shirika.Codec.Builtins.bytes_encode_length_eq_measure', 'Shirika.Codec.Builtins.bytes_decode_encode'],
        conformanceVectors: ['bytes-small'],
        valueScope: 'small-length-prefix-values',
        acceptsMeasuredWriterValue: (value) => value.byteLength <= 0xff,
    },
);

function isU8Value(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= 0xff;
}
function isU16Value(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= 0xffff;
}
function isU32Value(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}
function isI32Value(value: number): boolean {
    return Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff;
}
export function void_(): BinaryCodec<void> {
    return voidCodec;
}
export function bool(): BinaryCodec<boolean> {
    return boolCodec;
}
export function u8(): BinaryCodec<number> {
    return u8Codec;
}
export function u16(): BinaryCodec<number> {
    return u16Codec;
}
export function u32(): BinaryCodec<number> {
    return u32Codec;
}
export function i32(): BinaryCodec<number> {
    return i32Codec;
}
export function f64(): BinaryCodec<number> {
    return f64Codec;
}
export function string(): BinaryCodec<string> {
    return stringCodec;
}
export function bytes(): BinaryCodec<Uint8Array> {
    return bytesCodec;
}
