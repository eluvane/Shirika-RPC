import { utf8ByteLength } from '../utf8.js';
import { defineCodecSignature } from './signature.js';
import { getSpecializedReadSideStrategy } from './specialized-readers.js';
import type { BinaryCodec } from './types.js';
import { defineInternalCodecWitness } from './witness.js';

function defineFixedBinaryCodec<T>(signature: string, size: number, write: BinaryCodec<T>['write'], read: BinaryCodec<T>['read']): BinaryCodec<T> {
    return defineCodecSignature<BinaryCodec<T>>(
        {
            kind: 'binary',
            measure: () => size,
            write,
            read,
        },
        signature,
    );
}

function definePrimitiveWitnessCodec<T>(
    signature: string,
    size: number,
    write: BinaryCodec<T>['write'],
    read: BinaryCodec<T>['read'],
    extra: {
        readonly valueScope?: 'bounded-primitive-values';
        readonly acceptsMeasuredWriterValue?: (value: T) => boolean;
    } = {},
): BinaryCodec<T> {
    return defineInternalCodecWitness(defineFixedBinaryCodec(signature, size, write, read), {
        codecKind: 'primitive',
        signature,
        leanCodec: `Shirika.Codec.Builtins.${signature}Codec`,
        leanTheorems: [`Shirika.Codec.Builtins.${signature}_lawful`],
        conformanceVectors: [`primitive-${signature}`],
        readSideStrategy: getSpecializedReadSideStrategy(signature),
        ...(extra.valueScope !== undefined ? { valueScope: extra.valueScope } : {}),
        ...(extra.acceptsMeasuredWriterValue !== undefined ? { acceptsMeasuredWriterValue: extra.acceptsMeasuredWriterValue } : {}),
    });
}

const voidCodec = defineInternalCodecWitness(
    defineFixedBinaryCodec(
        'void',
        0,
        () => undefined,
        () => undefined,
    ) as BinaryCodec<void>,
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
const boolCodec = definePrimitiveWitnessCodec<boolean>(
    'bool',
    1,
    (writer, value) => writer.writeBool(value),
    (reader) => reader.readBool(),
);
const u8Codec = definePrimitiveWitnessCodec<number>(
    'u8',
    1,
    (writer, value) => writer.writeU8(value),
    (reader) => reader.readU8(),
    {
        valueScope: 'bounded-primitive-values',
        acceptsMeasuredWriterValue: (value) => isUintInRange(value, 0xff),
    },
);
const u16Codec = definePrimitiveWitnessCodec<number>(
    'u16',
    2,
    (writer, value) => writer.writeU16(value),
    (reader) => reader.readU16(),
    {
        valueScope: 'bounded-primitive-values',
        acceptsMeasuredWriterValue: (value) => isUintInRange(value, 0xffff),
    },
);
const u32Codec = definePrimitiveWitnessCodec<number>(
    'u32',
    4,
    (writer, value) => writer.writeU32(value),
    (reader) => reader.readU32(),
    {
        valueScope: 'bounded-primitive-values',
        acceptsMeasuredWriterValue: (value) => isUintInRange(value, 0xffffffff),
    },
);
const i32Codec = definePrimitiveWitnessCodec<number>(
    'i32',
    4,
    (writer, value) => writer.writeI32(value),
    (reader) => reader.readI32(),
    {
        valueScope: 'bounded-primitive-values',
        acceptsMeasuredWriterValue: (value) => Number.isInteger(value) && value >= -0x80000000 && value <= 0x7fffffff,
    },
);
const f64Codec = defineFixedBinaryCodec<number>(
    'f64',
    8,
    (writer, value) => writer.writeF64(value),
    (reader) => reader.readF64(),
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

function isUintInRange(value: number, max: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= max;
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
