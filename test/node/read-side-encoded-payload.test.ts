import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { type EncodedPayloadRange, hasReadSideValidationWitness, validateAndDecodePreparedEncodedPayload } from '../../dist/core/codec/witness.js';
import { setFastPathStrategyForTest } from '../../dist/core/fast-path-strategy.js';
import type { BinaryCodec, PreparedBinaryCodec } from '../../dist/index.js';
import {
    codecs,
    createRingBufferSab,
    createRingLayout,
    createWaitStrategy,
    DuplexEndpoint,
    defineCodecSignature,
    describeCodec,
    MIN_CAPACITY_BYTES,
    Opcode,
    prepareBinaryCodec,
    RingBinaryReader,
    RingBinaryWriter,
    readCodecWitness,
    SharedRingBuffer,
    ShirikaProtocolError,
} from '../../dist/index.js';

beforeEach(() => {
    setFastPathStrategyForTest({ readSideEncodedPayload: true });
});

afterEach(() => {
    setFastPathStrategyForTest(undefined);
});

const selectedReadVectors: Array<{
    readonly name: string;
    readonly codec: BinaryCodec<unknown>;
    readonly value: unknown;
    readonly expectedStrategyId: string;
}> = [
    { name: 'primitive-void', codec: codecs.void(), value: undefined, expectedStrategyId: 'read-side:void' },
    { name: 'primitive-bool', codec: codecs.bool(), value: true, expectedStrategyId: 'read-side:bool' },
    { name: 'primitive-u8', codec: codecs.u8(), value: 0x7f, expectedStrategyId: 'read-side:u8' },
    { name: 'primitive-u16', codec: codecs.u16(), value: 0x1234, expectedStrategyId: 'read-side:u16' },
    { name: 'primitive-u32', codec: codecs.u32(), value: 0x12345678, expectedStrategyId: 'read-side:u32' },
    { name: 'primitive-i32', codec: codecs.i32(), value: -2, expectedStrategyId: 'read-side:i32' },
    {
        name: 'tuple-bool-u8',
        codec: codecs.tuple([codecs.bool(), codecs.u8()]),
        value: [false, 9],
        expectedStrategyId: 'read-side:tuple(bool,u8)',
    },
    {
        name: 'tuple-bool-u16',
        codec: codecs.tuple([codecs.bool(), codecs.u16()]),
        value: [true, 0x1234],
        expectedStrategyId: 'read-side:tuple(bool,u16)',
    },
    {
        name: 'struct-simple',
        codec: codecs.struct({ tag: codecs.u8(), count: codecs.u16(), ok: codecs.bool() }),
        value: { tag: 7, count: 0x1234, ok: true },
        expectedStrategyId: 'read-side:struct(tag:u8,count:u16,ok:bool)',
    },
];

describe('ValidatedEncodedPayload read-side specialization', () => {
    test('selected generated/proven binary codecs validate and decode to the same value as the safe reader', () => {
        for (const vector of selectedReadVectors) {
            const prepared = expectPrepared(vector.codec);
            const encoded = encodeWithSafeWriter(prepared, vector.value);
            const safe = decodeWithSafeReader(prepared, encoded);
            const specialized = decodeWithValidatedPayload(prepared, encoded);
            expect(prepared.witness.readSideValidation, vector.name).toBe(true);
            expect(prepared.witness.readSideStrategyId, vector.name).toBe(vector.expectedStrategyId);
            expect(hasReadSideValidationWitness(prepared), vector.name).toBe(true);
            expect(normalizeValue(specialized.value), vector.name).toStrictEqual(normalizeValue(safe));
            expect(specialized.witness.signature, vector.name).toBe(describeCodec(vector.codec));
            expect(specialized.witness.strategyId, vector.name).toBe(vector.expectedStrategyId);
            expect(specialized.witness.conformanceVectors, vector.name).toContain(vector.name);
        }
    });

    test('read-side validation preserves safe reader protocol-error classification for too-short and trailing payloads', () => {
        for (const vector of selectedReadVectors) {
            const prepared = expectPrepared(vector.codec);
            const encoded = encodeWithSafeWriter(prepared, vector.value);
            const invalidPayloads = [{ label: 'trailing', bytes: appendByte(encoded, 0xff) }];
            if (encoded.byteLength > 0) {
                invalidPayloads.unshift({ label: 'too-short', bytes: encoded.slice(0, encoded.byteLength - 1) });
            }
            for (const invalid of invalidPayloads) {
                const safeError = captureProtocolError(() => decodeWithSafeReader(prepared, invalid.bytes));
                const specializedError = captureProtocolError(() => decodeWithValidatedPayload(prepared, invalid.bytes));
                expect(specializedError.name, `${vector.name}/${invalid.label}`).toBe(safeError.name);
                expect(specializedError.message, `${vector.name}/${invalid.label}`).toBe(safeError.message);
            }
        }
    });

    test('frame read path uses the selected read-side witness for a prepared simple struct', async () => {
        const codec = codecs.struct({ tag: codecs.u8(), count: codecs.u16(), ok: codecs.bool() });
        const prepared = expectPrepared(codec);
        const value = { tag: 5, count: 0x4567, ok: false };
        const { left, right } = createEndpointPair(128);
        await left.send(Opcode.REQUEST, 1, 1, prepared, value);
        const frame = await right.receive();
        expect(normalizeValue(frame.readWithCodec(prepared))).toStrictEqual(normalizeValue(value));
    });

    test('length-prefixed bytes and arrays remain on safe reader fallback', () => {
        const bytesCodec = expectPrepared(codecs.bytes());
        const arrayU8 = expectPrepared(codecs.array(codecs.u8()));
        expect(bytesCodec.witness.readSideValidation).toBe(false);
        expect(arrayU8.witness.readSideValidation).toBe(false);
        expect(decodeWithValidatedPayloadOrUndefined(bytesCodec, Uint8Array.from([2, 0, 0, 0, 0xde]))).toBeUndefined();
        expect(() => decodeWithSafeReader(bytesCodec, Uint8Array.from([2, 0, 0, 0, 0xde]))).toThrow(ShirikaProtocolError);
        expect(decodeWithValidatedPayloadOrUndefined(arrayU8, Uint8Array.from([3, 0, 0, 0, 1]))).toBeUndefined();
        expect(() => decodeWithSafeReader(arrayU8, Uint8Array.from([3, 0, 0, 0, 1]))).toThrow(ShirikaProtocolError);
    });

    test('nested representative struct remains fallback and malformed nested payload is classified by the safe reader', () => {
        const nested = expectPrepared(
            codecs.struct({
                tag: codecs.u8(),
                maybePayload: codecs.optional(codecs.bytes()),
                pairs: codecs.array(codecs.tuple([codecs.bool(), codecs.u8()])),
            }),
        );
        const malformed = Uint8Array.from([9, 1, 2, 0, 0, 0, 0xde]);
        expect(nested.witness.readSideValidation).toBe(false);
        expect(decodeWithValidatedPayloadOrUndefined(nested, malformed)).toBeUndefined();
        expect(() => decodeWithSafeReader(nested, malformed)).toThrow(ShirikaProtocolError);
    });

    test('custom codecs, forged signatures, and msgpack do not get a read-side witness', async () => {
        const customU32 = defineCodecSignature<BinaryCodec<number>>(
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
        );
        expect(readCodecWitness(customU32)).toBeUndefined();
        expect(prepareBinaryCodec(customU32)).toBeUndefined();
        expect(hasReadSideValidationWitness(customU32)).toBe(false);

        const msgpackCodec = codecs.msgpack<{ readonly ok: boolean }>();
        const { left, right } = createEndpointPair(128);
        await left.send(Opcode.REQUEST, 1, 1, msgpackCodec, { ok: true });
        const frame = await right.receive();
        expect(frame.readWithCodec(msgpackCodec)).toStrictEqual({ ok: true });
    });

    test('read-side internal helpers are not exported through the public package entrypoint', async () => {
        const publicEntrypoint = await import('../../dist/index.js');
        expect(Object.hasOwn(publicEntrypoint, 'validateAndDecodePreparedEncodedPayload')).toBe(false);
        expect(Object.hasOwn(publicEntrypoint, 'hasReadSideValidationWitness')).toBe(false);
    });
});

function expectPrepared<T>(codec: BinaryCodec<T>): PreparedBinaryCodec<T> {
    const prepared = prepareBinaryCodec(codec);
    if (prepared === undefined) {
        throw new Error(`Expected prepared binary codec for ${describeCodec(codec)}`);
    }
    return prepared;
}
function encodeWithSafeWriter<T>(codec: BinaryCodec<T>, value: T): Uint8Array {
    const payloadLength = codec.measure(value);
    const ring = createScratchRing(payloadLength);
    const writer = new RingBinaryWriter(ring, 0, payloadLength);
    codec.write(writer, value);
    writer.finish();
    return readPayload(ring, payloadLength);
}
function decodeWithSafeReader<T>(codec: BinaryCodec<T>, encoded: Uint8Array): T {
    const ring = createScratchRing(encoded.byteLength);
    ring.writeBytes(0, encoded);
    const reader = new RingBinaryReader(ring, 0, encoded.byteLength);
    const value = codec.read(reader);
    reader.assertFullyRead();
    return value;
}
function decodeWithValidatedPayload<T>(prepared: PreparedBinaryCodec<T>, encoded: Uint8Array) {
    const decoded = decodeWithValidatedPayloadOrUndefined(prepared, encoded);
    if (decoded === undefined) {
        throw new Error(`Expected read-side validation for ${prepared.witness.signature}`);
    }
    return decoded;
}
function decodeWithValidatedPayloadOrUndefined<T>(prepared: PreparedBinaryCodec<T>, encoded: Uint8Array) {
    const ring = createScratchRing(encoded.byteLength);
    ring.writeBytes(0, encoded);
    const range: EncodedPayloadRange = { payloadSeq: 0, payloadLength: encoded.byteLength };
    return validateAndDecodePreparedEncodedPayload(prepared, ring, range);
}
function captureProtocolError(run: () => unknown): { readonly name: string; readonly message: string } {
    try {
        run();
    } catch (error) {
        expect(error).toBeInstanceOf(ShirikaProtocolError);
        return { name: (error as Error).name, message: (error as Error).message };
    }
    throw new Error('Expected ShirikaProtocolError');
}
function appendByte(bytes: Uint8Array, byte: number): Uint8Array {
    const result = new Uint8Array(bytes.byteLength + 1);
    result.set(bytes);
    result[bytes.byteLength] = byte;
    return result;
}
function createEndpointPair(capacityBytes: number): { readonly left: DuplexEndpoint; readonly right: DuplexEndpoint } {
    const aToB = createRingBufferSab(capacityBytes);
    const bToA = createRingBufferSab(capacityBytes);
    const left = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(aToB, capacityBytes), createWaitStrategy(false), 'read-side-left->right'),
        inbound: new SharedRingBuffer(createRingLayout(bToA, capacityBytes), createWaitStrategy(false), 'read-side-right->left'),
    });
    const right = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(bToA, capacityBytes), createWaitStrategy(false), 'read-side-right->left'),
        inbound: new SharedRingBuffer(createRingLayout(aToB, capacityBytes), createWaitStrategy(false), 'read-side-left->right'),
    });
    return { left, right };
}
function createScratchRing(payloadLength: number): SharedRingBuffer {
    const capacityBytes = nextPowerOfTwo(Math.max(MIN_CAPACITY_BYTES, payloadLength, 1));
    const sab = createRingBufferSab(capacityBytes);
    return new SharedRingBuffer(createRingLayout(sab, capacityBytes), createWaitStrategy(false), 'read-side-test');
}
function readPayload(ring: SharedRingBuffer, payloadLength: number): Uint8Array {
    const bytes = new Uint8Array(payloadLength);
    ring.readInto(0, bytes, 0, payloadLength);
    return bytes;
}
function nextPowerOfTwo(value: number): number {
    let result = 1;
    while (result < value) {
        result *= 2;
    }
    return result;
}
function normalizeValue(value: unknown): unknown {
    if (value instanceof Uint8Array) {
        return [...value];
    }
    if (Array.isArray(value)) {
        return value.map((item) => normalizeValue(item));
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, normalizeValue((value as Record<string, unknown>)[key])]),
        );
    }
    return value;
}
