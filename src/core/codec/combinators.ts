import { defineCodecSignature, describeCodec } from './signature.js';
import { getSpecializedReadSideStrategy } from './specialized-readers.js';
import { getSpecializedCompositeMeasuredWriter } from './specialized-writers.js';
import type { BinaryCodec } from './types.js';
import {
    type CodecWitnessValueScope,
    codecWitnessComponent,
    defineInternalCodecWitness,
    isMeasuredWriterValueInScope,
    type PreparedBinaryCodec,
    prepareBinaryCodec,
} from './witness.js';
export type TupleValue<TCodecs extends readonly BinaryCodec<unknown>[]> = {
    [K in keyof TCodecs]: TCodecs[K] extends BinaryCodec<infer TValue> ? TValue : never;
};
export type StructValue<TShape extends Record<string, BinaryCodec<unknown>>> = {
    [K in keyof TShape]: TShape[K] extends BinaryCodec<infer TValue> ? TValue : never;
};
interface SelectedCompositeWitnessMetadata {
    readonly leanCodec: string;
    readonly leanTheorems: readonly string[];
    readonly conformanceVectors: readonly string[];
    readonly measuredWriterFastPath?: boolean;
}
const selectedCompositeWitnesses = new Map<string, SelectedCompositeWitnessMetadata>([
    [
        'optional(u8)',
        {
            leanCodec: 'Shirika.Codec.Examples.optionalU8Codec',
            leanTheorems: ['Shirika.Codec.Examples.optionalU8_lawful'],
            conformanceVectors: ['optional-u8-none', 'optional-u8-present'],
        },
    ],
    [
        'optional(bytes)',
        {
            leanCodec: 'Shirika.Codec.Combinators.optionalCodec Shirika.Codec.Builtins.bytesCodec',
            leanTheorems: ['Shirika.Codec.Combinators.optional_lawful', 'Shirika.Codec.Builtins.bytes_lawful'],
            conformanceVectors: ['optional-bytes-none', 'optional-bytes-small-present', 'struct-nested-optional-bytes-array-tuple'],
        },
    ],
    [
        'array(u8)',
        {
            leanCodec: 'Shirika.Codec.Examples.arrayU8Codec',
            leanTheorems: ['Shirika.Codec.Examples.arrayU8_lawful'],
            conformanceVectors: ['array-u8-three-items'],
        },
    ],
    [
        'array(tuple(bool,u8))',
        {
            leanCodec: 'Shirika.Codec.Combinators.arrayCodec Shirika.Codec.Examples.tupleBoolU8Codec',
            leanTheorems: ['Shirika.Codec.Combinators.array_lawful', 'Shirika.Codec.Examples.tupleBoolU8_lawful'],
            conformanceVectors: ['array-tuple-bool-u8', 'struct-nested-optional-bytes-array-tuple'],
        },
    ],
    [
        'tuple(bool,u8)',
        {
            leanCodec: 'Shirika.Codec.Examples.tupleBoolU8Codec',
            leanTheorems: ['Shirika.Codec.Examples.tupleBoolU8_lawful'],
            conformanceVectors: ['tuple-bool-u8'],
        },
    ],
    [
        'tuple(bool,u16)',
        {
            leanCodec: 'Shirika.Codec.Examples.tupleBoolU16Codec',
            leanTheorems: ['Shirika.Codec.Examples.tupleBoolU16_lawful'],
            conformanceVectors: ['tuple-bool-u16'],
        },
    ],
    [
        'struct(tag:u8,count:u16,ok:bool)',
        {
            leanCodec: 'Shirika.Codec.Examples.simpleStructCodec',
            leanTheorems: ['Shirika.Codec.Examples.simpleStruct_lawful'],
            conformanceVectors: ['struct-simple'],
        },
    ],
    [
        'struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8)))',
        {
            leanCodec: 'Shirika.Codec.Examples.representativeStructCodec',
            leanTheorems: ['Shirika.Codec.Examples.representativeStruct_encode_length_eq_measure', 'Shirika.Codec.Examples.representativeStruct_decode_encode'],
            conformanceVectors: ['struct-nested-optional-bytes-array-tuple'],
        },
    ],
]);

export function array<T>(itemCodec: BinaryCodec<T>): BinaryCodec<T[]> {
    const signature = `array(${describeCodec(itemCodec)})`;
    const codec = defineCodecSignature<BinaryCodec<T[]>>(
        {
            kind: 'binary',
            measure(value) {
                let size = 4;
                for (const item of value) {
                    size += itemCodec.measure(item);
                }
                return size;
            },
            write(writer, value) {
                writer.writeArrayHeader(value.length);
                for (const item of value) {
                    itemCodec.write(writer, item);
                }
            },
            read(reader) {
                const length = reader.readArrayHeader();
                const result: T[] = [];
                for (let index = 0; index < length; index += 1) {
                    result.push(itemCodec.read(reader));
                }
                return result;
            },
        },
        signature,
    );
    const itemPrepared = prepareBinaryCodec(itemCodec);
    const selected = selectedCompositeWitnesses.get(signature);
    if (itemPrepared === undefined || selected === undefined) {
        return codec;
    }
    const specializedMeasuredWriter = getSpecializedCompositeMeasuredWriter(signature);
    const readSideStrategy = getSpecializedReadSideStrategy(signature);
    return defineInternalCodecWitness(codec, {
        codecKind: 'array',
        signature,
        leanCodec: selected.leanCodec,
        leanTheorems: selected.leanTheorems,
        conformanceVectors: selected.conformanceVectors,
        measuredWriterFastPath: specializedMeasuredWriter !== undefined && (selected.measuredWriterFastPath ?? true),
        specializedMeasuredWriter,
        readSideStrategy,
        valueScope: 'small-length-prefix-values',
        components: [codecWitnessComponent(itemPrepared.witness)],
        acceptsMeasuredWriterValue: (value) => value.length <= 0xff && value.every((item) => acceptsPreparedValue(itemPrepared, item)),
    });
}
export function optional<T>(itemCodec: BinaryCodec<T>): BinaryCodec<T | undefined> {
    const signature = `optional(${describeCodec(itemCodec)})`;
    const codec = defineCodecSignature<BinaryCodec<T | undefined>>(
        {
            kind: 'binary',
            measure(value) {
                return value === undefined ? 1 : 1 + itemCodec.measure(value);
            },
            write(writer, value) {
                writer.writeBool(value !== undefined);
                if (value !== undefined) {
                    itemCodec.write(writer, value);
                }
            },
            read(reader) {
                return reader.readBool() ? itemCodec.read(reader) : undefined;
            },
        },
        signature,
    );
    const itemPrepared = prepareBinaryCodec(itemCodec);
    const selected = selectedCompositeWitnesses.get(signature);
    if (itemPrepared === undefined || selected === undefined) {
        return codec;
    }
    const specializedMeasuredWriter = getSpecializedCompositeMeasuredWriter(signature);
    const readSideStrategy = getSpecializedReadSideStrategy(signature);
    return defineInternalCodecWitness(codec, {
        codecKind: 'optional',
        signature,
        leanCodec: selected.leanCodec,
        leanTheorems: selected.leanTheorems,
        conformanceVectors: selected.conformanceVectors,
        measuredWriterFastPath: specializedMeasuredWriter !== undefined && (selected.measuredWriterFastPath ?? true),
        specializedMeasuredWriter,
        readSideStrategy,
        valueScope: compositeValueScope([itemPrepared]),
        components: [codecWitnessComponent(itemPrepared.witness)],
        acceptsMeasuredWriterValue: (value) => value === undefined || acceptsPreparedValue(itemPrepared, value),
    });
}
export function tuple<const TCodecs extends readonly BinaryCodec<unknown>[]>(codecs: TCodecs): BinaryCodec<TupleValue<TCodecs>> {
    const signature = `tuple(${codecs.map((codec) => describeCodec(codec)).join(',')})`;
    const codec = defineCodecSignature<BinaryCodec<TupleValue<TCodecs>>>(
        {
            kind: 'binary',
            measure(value) {
                return codecs.reduce((size, itemCodec, index) => {
                    return size + itemCodec.measure(value[index] as never);
                }, 0);
            },
            write(writer, value) {
                codecs.forEach((itemCodec, index) => {
                    itemCodec.write(writer, value[index] as never);
                });
            },
            read(reader) {
                return codecs.map((itemCodec) => itemCodec.read(reader)) as TupleValue<TCodecs>;
            },
        },
        signature,
    );
    const preparedCodecs = codecs.map((itemCodec) => prepareBinaryCodec(itemCodec));
    const selected = selectedCompositeWitnesses.get(signature);
    if (selected === undefined || preparedCodecs.includes(undefined)) {
        return codec;
    }
    const preparedTupleCodecs = preparedCodecs as PreparedBinaryCodec<unknown>[];
    const specializedMeasuredWriter = getSpecializedCompositeMeasuredWriter(signature);
    const readSideStrategy = getSpecializedReadSideStrategy(signature);
    return defineInternalCodecWitness(codec, {
        codecKind: 'tuple',
        signature,
        leanCodec: selected.leanCodec,
        leanTheorems: selected.leanTheorems,
        conformanceVectors: selected.conformanceVectors,
        measuredWriterFastPath: specializedMeasuredWriter !== undefined && (selected.measuredWriterFastPath ?? true),
        specializedMeasuredWriter,
        readSideStrategy,
        valueScope: compositeValueScope(preparedTupleCodecs),
        components: preparedTupleCodecs.map((prepared) => codecWitnessComponent(prepared.witness)),
        acceptsMeasuredWriterValue: (value) =>
            Array.isArray(value) &&
            value.length === preparedTupleCodecs.length &&
            preparedTupleCodecs.every((prepared, index) => acceptsPreparedValue(prepared, value[index])),
    });
}
export function struct<const TShape extends Record<string, BinaryCodec<unknown>>>(shape: TShape): BinaryCodec<StructValue<TShape>> {
    const entries = Object.entries(shape) as [keyof TShape, BinaryCodec<unknown>][];
    const signature = `struct(${entries.map(([key, codec]) => `${String(key)}:${describeCodec(codec)}`).join(',')})`;
    const codec = defineCodecSignature<BinaryCodec<StructValue<TShape>>>(
        {
            kind: 'binary',
            measure(value) {
                let size = 0;
                for (const [key, itemCodec] of entries) {
                    size += itemCodec.measure(value[key] as never);
                }
                return size;
            },
            write(writer, value) {
                for (const [key, itemCodec] of entries) {
                    itemCodec.write(writer, value[key] as never);
                }
            },
            read(reader) {
                const result = {} as StructValue<TShape>;
                for (const [key, itemCodec] of entries) {
                    (result as Record<string, unknown>)[key as string] = itemCodec.read(reader);
                }
                return result;
            },
        },
        signature,
    );
    const preparedEntries = entries.map(([key, itemCodec]) => [key, prepareBinaryCodec(itemCodec)] as const);
    const selected = selectedCompositeWitnesses.get(signature);
    if (selected === undefined || preparedEntries.some(([, prepared]) => prepared === undefined)) {
        return codec;
    }
    const preparedStructEntries = preparedEntries as Array<readonly [keyof TShape, PreparedBinaryCodec<unknown>]>;
    const specializedMeasuredWriter = getSpecializedCompositeMeasuredWriter(signature);
    const readSideStrategy = getSpecializedReadSideStrategy(signature);
    return defineInternalCodecWitness(codec, {
        codecKind: 'struct',
        signature,
        leanCodec: selected.leanCodec,
        leanTheorems: selected.leanTheorems,
        conformanceVectors: selected.conformanceVectors,
        measuredWriterFastPath: specializedMeasuredWriter !== undefined && (selected.measuredWriterFastPath ?? true),
        specializedMeasuredWriter,
        readSideStrategy,
        valueScope: compositeValueScope(preparedStructEntries.map(([, prepared]) => prepared)),
        components: preparedStructEntries.map(([, prepared]) => codecWitnessComponent(prepared.witness)),
        acceptsMeasuredWriterValue: (value) => acceptsPreparedStructValue(value, preparedStructEntries),
    });
}

function acceptsPreparedValue<T>(prepared: PreparedBinaryCodec<T>, value: T): boolean {
    return isMeasuredWriterValueInScope(prepared, value);
}
function acceptsPreparedStructValue<TShape extends Record<string, BinaryCodec<unknown>>>(
    value: StructValue<TShape>,
    entries: Array<readonly [keyof TShape, PreparedBinaryCodec<unknown>]>,
): boolean {
    if (value === null || typeof value !== 'object') {
        return false;
    }
    const record = value as Record<string, unknown>;
    return entries.every(([key, prepared]) => isMeasuredWriterValueInScope(prepared, record[String(key)]));
}

function compositeValueScope(preparedCodecs: readonly { readonly witness: { readonly valueScope: CodecWitnessValueScope } }[]): CodecWitnessValueScope {
    if (preparedCodecs.some((prepared) => prepared.witness.valueScope === 'small-length-prefix-values')) {
        return 'small-length-prefix-values';
    }
    if (preparedCodecs.some((prepared) => prepared.witness.valueScope === 'bounded-primitive-values')) {
        return 'bounded-primitive-values';
    }
    return 'all-values';
}
