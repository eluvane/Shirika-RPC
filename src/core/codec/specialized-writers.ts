import { ShirikaProtocolError } from '../errors.js';
import type { BinaryWriter } from './types.js';
import type { InternalMeasuredWriterStrategy } from './witness.js';

const SMALL_LENGTH_PREFIX_MAX = 0xff;

const tupleBoolU8Strategy = defineStrategy({
    id: 'specialized:tuple(bool,u8)',
    conformanceVectors: ['tuple-bool-u8'],
    measure: measureTupleBoolU8,
    write(writer, value, expectedPayloadLength) {
        assertExactPayloadLength(tupleBoolU8Strategy.id, expectedPayloadLength, 2);
        const item = requireTuple(value, 2);
        const flag = requireBool(item[0]);
        const byte = requireU8(item[1]);
        writer.writeBool(flag);
        writer.writeU8(byte);
    },
});

const tupleBoolU16Strategy = defineStrategy({
    id: 'specialized:tuple(bool,u16)',
    conformanceVectors: ['tuple-bool-u16'],
    measure: measureTupleBoolU16,
    write(writer, value, expectedPayloadLength) {
        assertExactPayloadLength(tupleBoolU16Strategy.id, expectedPayloadLength, 3);
        const item = requireTuple(value, 2);
        const flag = requireBool(item[0]);
        const word = requireU16(item[1]);
        writer.writeBool(flag);
        writer.writeU16(word);
    },
});

const optionalU8Strategy = defineStrategy({
    id: 'specialized:optional(u8)',
    conformanceVectors: ['optional-u8-none', 'optional-u8-present'],
    measure: measureOptionalU8,
    write(writer, value, expectedPayloadLength) {
        if (value === undefined) {
            assertExactPayloadLength(optionalU8Strategy.id, expectedPayloadLength, 1);
            writer.writeBool(false);
            return;
        }
        const byte = requireU8(value);
        assertExactPayloadLength(optionalU8Strategy.id, expectedPayloadLength, 2);
        writer.writeBool(true);
        writer.writeU8(byte);
    },
});

const optionalBytesStrategy = defineStrategy({
    id: 'specialized:optional(bytes)',
    conformanceVectors: ['optional-bytes-none', 'optional-bytes-small-present'],
    measure: measureOptionalBytes,
    write(writer, value, expectedPayloadLength) {
        if (value === undefined) {
            assertExactPayloadLength(optionalBytesStrategy.id, expectedPayloadLength, 1);
            writer.writeBool(false);
            return;
        }
        const bytes = requireSmallBytes(value);
        assertExactPayloadLength(optionalBytesStrategy.id, expectedPayloadLength, 1 + 4 + bytes.byteLength);
        writer.writeBool(true);
        writer.writeVarBytes(bytes);
    },
});

const arrayU8Strategy = defineStrategy({
    id: 'specialized:array(u8)',
    conformanceVectors: ['array-u8-three-items'],
    measure: measureArrayU8,
    write(writer, value, expectedPayloadLength) {
        const items = requireArray(value);
        assertExactPayloadLength(arrayU8Strategy.id, expectedPayloadLength, 4 + items.length);
        for (const item of items) {
            requireU8(item);
        }
        writer.writeArrayHeader(items.length);
        for (const item of items) {
            writer.writeU8(requireU8(item));
        }
    },
});

const arrayTupleBoolU8Strategy = defineStrategy({
    id: 'specialized:array(tuple(bool,u8))',
    conformanceVectors: ['array-tuple-bool-u8'],
    measure: measureArrayTupleBoolU8,
    write(writer, value, expectedPayloadLength) {
        const items = requireArray(value);
        assertExactPayloadLength(arrayTupleBoolU8Strategy.id, expectedPayloadLength, 4 + items.length * 2);
        for (const rawItem of items) {
            const item = requireTuple(rawItem, 2);
            requireBool(item[0]);
            requireU8(item[1]);
        }
        writer.writeArrayHeader(items.length);
        for (const rawItem of items) {
            const item = requireTuple(rawItem, 2);
            writer.writeBool(requireBool(item[0]));
            writer.writeU8(requireU8(item[1]));
        }
    },
});

const simpleStructStrategy = defineStrategy({
    id: 'specialized:struct(tag:u8,count:u16,ok:bool)',
    conformanceVectors: ['struct-simple'],
    measure: measureSimpleStruct,
    write(writer, value, expectedPayloadLength) {
        assertExactPayloadLength(simpleStructStrategy.id, expectedPayloadLength, 4);
        const record = requireRecord(value);
        const tag = requireU8(record.tag);
        const count = requireU16(record.count);
        const ok = requireBool(record.ok);
        writer.writeU8(tag);
        writer.writeU16(count);
        writer.writeBool(ok);
    },
});

const nestedStructStrategy = defineStrategy({
    id: 'specialized:struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8)))',
    conformanceVectors: ['struct-nested-optional-bytes-array-tuple'],
    measure: measureNestedStruct,
    write(writer, value, expectedPayloadLength) {
        const record = requireRecord(value);
        const tag = requireU8(record.tag);
        const optionalBytesLength = measureOptionalBytes(record.maybePayload);
        const pairsLength = measureArrayTupleBoolU8(record.pairs);
        if (optionalBytesLength === undefined || pairsLength === undefined) {
            throw new ShirikaProtocolError(`Specialized writer strategy ${nestedStructStrategy.id} rejected an out-of-scope value before writing`);
        }
        assertExactPayloadLength(nestedStructStrategy.id, expectedPayloadLength, 1 + optionalBytesLength + pairsLength);
        writer.writeU8(tag);
        writeOptionalBytes(writer, record.maybePayload);
        writeArrayTupleBoolU8(writer, record.pairs);
    },
});

const specializedCompositeStrategies = new Map<string, InternalMeasuredWriterStrategy>([
    ['tuple(bool,u8)', tupleBoolU8Strategy],
    ['tuple(bool,u16)', tupleBoolU16Strategy],
    ['optional(u8)', optionalU8Strategy],
    ['optional(bytes)', optionalBytesStrategy],
    ['array(u8)', arrayU8Strategy],
    ['array(tuple(bool,u8))', arrayTupleBoolU8Strategy],
    ['struct(tag:u8,count:u16,ok:bool)', simpleStructStrategy],
    ['struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8)))', nestedStructStrategy],
]);

export function getSpecializedCompositeMeasuredWriter(signature: string): InternalMeasuredWriterStrategy | undefined {
    return specializedCompositeStrategies.get(signature);
}

function defineStrategy(strategy: InternalMeasuredWriterStrategy): InternalMeasuredWriterStrategy {
    return Object.freeze({
        id: strategy.id,
        conformanceVectors: Object.freeze([...strategy.conformanceVectors]),
        measure: strategy.measure,
        write: strategy.write,
    });
}

function measureTupleBoolU8(value: unknown): number | undefined {
    if (!isTuple(value, 2) || typeof value[0] !== 'boolean' || !isU8Value(value[1])) {
        return undefined;
    }
    return 2;
}

function measureTupleBoolU16(value: unknown): number | undefined {
    if (!isTuple(value, 2) || typeof value[0] !== 'boolean' || !isU16Value(value[1])) {
        return undefined;
    }
    return 3;
}

function measureOptionalU8(value: unknown): number | undefined {
    if (value === undefined) {
        return 1;
    }
    if (!isU8Value(value)) {
        return undefined;
    }
    return 2;
}

function measureOptionalBytes(value: unknown): number | undefined {
    if (value === undefined) {
        return 1;
    }
    if (!isSmallBytesValue(value)) {
        return undefined;
    }
    return 1 + 4 + value.byteLength;
}

function measureArrayU8(value: unknown): number | undefined {
    if (!isSmallArray(value)) {
        return undefined;
    }
    for (const item of value) {
        if (!isU8Value(item)) {
            return undefined;
        }
    }
    return 4 + value.length;
}

function measureArrayTupleBoolU8(value: unknown): number | undefined {
    if (!isSmallArray(value)) {
        return undefined;
    }
    for (const item of value) {
        if (measureTupleBoolU8(item) === undefined) {
            return undefined;
        }
    }
    return 4 + value.length * 2;
}

function measureSimpleStruct(value: unknown): number | undefined {
    if (!isRecord(value) || !isU8Value(value.tag) || !isU16Value(value.count) || typeof value.ok !== 'boolean') {
        return undefined;
    }
    return 4;
}

function measureNestedStruct(value: unknown): number | undefined {
    if (!isRecord(value) || !isU8Value(value.tag)) {
        return undefined;
    }
    const optionalBytesLength = measureOptionalBytes(value.maybePayload);
    const pairsLength = measureArrayTupleBoolU8(value.pairs);
    if (optionalBytesLength === undefined || pairsLength === undefined) {
        return undefined;
    }
    return 1 + optionalBytesLength + pairsLength;
}

function writeOptionalBytes(writer: BinaryWriter, value: unknown): void {
    if (value === undefined) {
        writer.writeBool(false);
        return;
    }
    writer.writeBool(true);
    writer.writeVarBytes(requireSmallBytes(value));
}

function writeArrayTupleBoolU8(writer: BinaryWriter, value: unknown): void {
    const items = requireArray(value);
    writer.writeArrayHeader(items.length);
    for (const rawItem of items) {
        const item = requireTuple(rawItem, 2);
        writer.writeBool(requireBool(item[0]));
        writer.writeU8(requireU8(item[1]));
    }
}

function assertExactPayloadLength(strategyId: string, expectedPayloadLength: number, actualPayloadLength: number): void {
    if (actualPayloadLength !== expectedPayloadLength) {
        throw new ShirikaProtocolError(
            `Specialized writer strategy ${strategyId} measured ${actualPayloadLength} bytes after selection, expected ${expectedPayloadLength}`,
        );
    }
}

function isTuple(value: unknown, length: number): value is unknown[] {
    return Array.isArray(value) && value.length === length;
}

function requireTuple(value: unknown, length: number): unknown[] {
    if (!isTuple(value, length)) {
        throw new ShirikaProtocolError(`Specialized writer expected a tuple of length ${length}`);
    }
    return value;
}

function isSmallArray(value: unknown): value is unknown[] {
    return Array.isArray(value) && value.length <= SMALL_LENGTH_PREFIX_MAX;
}

function requireArray(value: unknown): unknown[] {
    if (!isSmallArray(value)) {
        throw new ShirikaProtocolError('Specialized writer expected a small array value');
    }
    return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function requireRecord(value: unknown): Record<string, unknown> {
    if (!isRecord(value)) {
        throw new ShirikaProtocolError('Specialized writer expected a struct object');
    }
    return value;
}

function isSmallBytesValue(value: unknown): value is Uint8Array {
    return value instanceof Uint8Array && value.byteLength <= SMALL_LENGTH_PREFIX_MAX;
}

function requireSmallBytes(value: unknown): Uint8Array {
    if (!isSmallBytesValue(value)) {
        throw new ShirikaProtocolError('Specialized writer expected a small Uint8Array payload');
    }
    return value;
}

function requireBool(value: unknown): boolean {
    if (typeof value !== 'boolean') {
        throw new ShirikaProtocolError('Specialized writer expected a boolean value');
    }
    return value;
}

function requireU8(value: unknown): number {
    if (!isU8Value(value)) {
        throw new ShirikaProtocolError('Specialized writer expected a u8 value');
    }
    return value;
}

function requireU16(value: unknown): number {
    if (!isU16Value(value)) {
        throw new ShirikaProtocolError('Specialized writer expected a u16 value');
    }
    return value;
}

function isU8Value(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xff;
}

function isU16Value(value: unknown): value is number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffff;
}
