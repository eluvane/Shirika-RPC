import { describe, expect, test } from 'vitest';
import { selectPreparedMeasuredWriter } from '../../dist/core/codec/witness.js';
import { unsafeCreateTrustedMeasuredRingBinaryWriter } from '../../dist/core/ring/ring-writer.js';
import type { BinaryCodec, PreparedBinaryCodec } from '../../dist/index.js';
import {
    codecs,
    createRingBufferSab,
    createRingLayout,
    createWaitStrategy,
    DuplexEndpoint,
    defineCodecSignature,
    describeCodec,
    isMeasuredWriterValueInScope,
    MIN_CAPACITY_BYTES,
    Opcode,
    prepareBinaryCodec,
    RingBinaryReader,
    RingBinaryWriter,
    readCodecWitness,
    SharedRingBuffer,
    ShirikaProtocolError,
} from '../../dist/index.js';

const selectedVectors: Array<{
    readonly name: string;
    readonly codec: BinaryCodec<unknown>;
    readonly value: unknown;
    readonly expectedHex: string;
    readonly expectedMeasuredWriterFastPath?: boolean;
}> = [
    { name: 'primitive-void', codec: codecs.void(), value: undefined, expectedHex: '' },
    { name: 'primitive-bool', codec: codecs.bool(), value: true, expectedHex: '01' },
    { name: 'primitive-u8', codec: codecs.u8(), value: 0x7f, expectedHex: '7f' },
    { name: 'primitive-u16', codec: codecs.u16(), value: 0x1234, expectedHex: '3412' },
    { name: 'primitive-u32', codec: codecs.u32(), value: 0x12345678, expectedHex: '78563412' },
    { name: 'primitive-i32', codec: codecs.i32(), value: -2, expectedHex: 'feffffff' },
    { name: 'bytes-small', codec: codecs.bytes(), value: Uint8Array.from([0xde, 0xad]), expectedHex: '02000000dead' },
    { name: 'optional-u8-none', codec: codecs.optional(codecs.u8()), value: undefined, expectedHex: '00' },
    { name: 'optional-u8-present', codec: codecs.optional(codecs.u8()), value: 42, expectedHex: '012a' },
    { name: 'optional-bytes-none', codec: codecs.optional(codecs.bytes()), value: undefined, expectedHex: '00' },
    {
        name: 'optional-bytes-small-present',
        codec: codecs.optional(codecs.bytes()),
        value: Uint8Array.from([0xca, 0xfe]),
        expectedHex: '0102000000cafe',
    },
    {
        name: 'array-u8-three-items',
        codec: codecs.array(codecs.u8()),
        value: [1, 2, 255],
        expectedHex: '030000000102ff',
    },
    {
        name: 'tuple-bool-u8',
        codec: codecs.tuple([codecs.bool(), codecs.u8()]),
        value: [false, 9],
        expectedHex: '0009',
    },
    {
        name: 'tuple-bool-u16',
        codec: codecs.tuple([codecs.bool(), codecs.u16()]),
        value: [true, 0x1234],
        expectedHex: '013412',
    },
    {
        name: 'array-tuple-bool-u8',
        codec: codecs.array(codecs.tuple([codecs.bool(), codecs.u8()])),
        value: [
            [true, 1],
            [false, 2],
        ],
        expectedHex: '0200000001010002',
    },
    {
        name: 'struct-simple',
        codec: codecs.struct({ tag: codecs.u8(), count: codecs.u16(), ok: codecs.bool() }),
        value: { tag: 7, count: 0x1234, ok: true },
        expectedHex: '07341201',
    },
    {
        name: 'struct-nested-optional-bytes-array-tuple',
        codec: codecs.struct({
            tag: codecs.u8(),
            maybePayload: codecs.optional(codecs.bytes()),
            pairs: codecs.array(codecs.tuple([codecs.bool(), codecs.u8()])),
        }),
        value: {
            tag: 9,
            maybePayload: Uint8Array.from([0xde, 0xad]),
            pairs: [
                [true, 1],
                [false, 2],
            ],
        },
        expectedHex: '090102000000dead0200000001010002',
    },
];

describe('PreparedBinaryCodec / CodecWitness', () => {
    test('selected codecs carry witness metadata; measured-enabled codecs encode identically through the selected writer', () => {
        for (const vector of selectedVectors) {
            const prepared = expectPrepared(vector.codec);
            const expectedMeasuredWriterFastPath = vector.expectedMeasuredWriterFastPath ?? true;
            expect(prepared.witness.signature).toBe(describeCodec(vector.codec));
            expect(prepared.witness.kind).toBe('binary');
            expect(prepared.witness.measuredWriterFastPath).toBe(expectedMeasuredWriterFastPath);
            expect(prepared.witness.conformanceVectors).toContain(vector.name);
            expect(isMeasuredWriterValueInScope(prepared, vector.value)).toBe(expectedMeasuredWriterFastPath);
            expect(bytesToHex(encodeWithSafeWriter(vector.codec, vector.value))).toBe(vector.expectedHex);
            if (expectedMeasuredWriterFastPath) {
                expect(bytesToHex(encodeWithSelectedMeasuredWriter(prepared, vector.value))).toBe(vector.expectedHex);
            } else {
                expect(bytesToHex(encodeWithSafeWriter(prepared, vector.value))).toBe(vector.expectedHex);
            }
        }
    });

    test('nested representative struct uses the specialized measured writer when its value is in scope', async () => {
        const codec = codecs.struct({
            tag: codecs.u8(),
            maybePayload: codecs.optional(codecs.bytes()),
            pairs: codecs.array(codecs.tuple([codecs.bool(), codecs.u8()])),
        });
        const value = {
            tag: 9,
            maybePayload: Uint8Array.from([0xde, 0xad]),
            pairs: [
                [true, 1],
                [false, 2],
            ],
        };
        const prepared = expectPrepared(codec);
        const selection = selectPreparedMeasuredWriter(prepared, value);
        expect(prepared.witness.measuredWriterFastPath).toBe(true);
        expect(isMeasuredWriterValueInScope(prepared, value)).toBe(true);
        expect(selection?.strategyId).toBe('specialized:struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8)))');
        const { left, right } = createEndpointPair(128);
        await left.send(Opcode.REQUEST, 1, 1, prepared, value);
        const frame = await right.receive();
        expect(frame.payloadLength).toBe(prepared.measure(value));
        expect(bytesToHex(encodeWithSafeWriter(prepared, frame.readWithCodec(prepared)))).toBe(bytesToHex(encodeWithSafeWriter(prepared, value)));
    });

    test('custom codecs and forged signatures stay on the safe fallback path', () => {
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
        expect(describeCodec(customU32)).toBe('u32');
        expect(readCodecWitness(customU32)).toBeUndefined();
        expect(prepareBinaryCodec(customU32)).toBeUndefined();
    });
    test('witnessed package codecs are frozen before public code can mutate law-critical methods', () => {
        const codec = codecs.u32();
        expect(Object.isFrozen(codec)).toBe(true);
        expect(() => {
            Object.defineProperty(codec, 'measure', {
                value: () => 1,
            });
        }).toThrow(TypeError);
        expect(expectPrepared(codec).measure(0x12345678)).toBe(4);
    });

    test('observable prepared-codec brand symbols do not authorize forged prepared codecs', () => {
        const prepared = expectPrepared(codecs.u32());
        const forgedCodec = defineCodecSignature<BinaryCodec<number>>(
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
        const forged = {
            kind: 'binary' as const,
            codec: forgedCodec,
            witness: prepared.witness,
            measure: forgedCodec.measure,
            write: forgedCodec.write,
            read: forgedCodec.read,
        } as PreparedBinaryCodec<number> & Record<PropertyKey, unknown>;
        for (const symbol of Object.getOwnPropertySymbols(prepared)) {
            forged[symbol] = true;
        }
        expect(Object.getOwnPropertySymbols(prepared).length).toBeGreaterThan(0);
        expect(prepareBinaryCodec(forged)).toBeUndefined();
        expect(isMeasuredWriterValueInScope(forged, 1)).toBe(false);
        expect(selectPreparedMeasuredWriter(forged, 1)).toBeUndefined();
        expect(readCodecWitness(forged)).toBeUndefined();
    });

    test('forged bytes signature does not enter the aligned bytes writer path', async () => {
        const forgedBytes = defineCodecSignature<BinaryCodec<Uint8Array>>(
            {
                kind: 'binary',
                measure(value) {
                    return value.byteLength;
                },
                write(writer, value) {
                    writer.writeBytes(value);
                },
                read(reader) {
                    return reader.readBytes(reader.remainingBytes);
                },
            },
            'bytes',
        );
        const payload = Uint8Array.from([0xab, 0xcd]);
        const { left, right } = createEndpointPair(64);
        expect(prepareBinaryCodec(forgedBytes)).toBeUndefined();
        await left.send(Opcode.REQUEST, 1, 1, forgedBytes, payload);
        const frame = await right.receive();
        expect(frame.payloadLength).toBe(payload.byteLength);
        expect(bytesToHex(frame.readWithCodec(forgedBytes))).toBe('abcd');
    });

    test('small Lean length-prefix scope gates selected measured writer values', () => {
        expect(isMeasuredWriterValueInScope(expectPrepared(codecs.bytes()), new Uint8Array(255))).toBe(true);
        expect(isMeasuredWriterValueInScope(expectPrepared(codecs.bytes()), new Uint8Array(256))).toBe(false);
        expect(isMeasuredWriterValueInScope(expectPrepared(codecs.array(codecs.u8())), Array.from({ length: 255 }).fill(1))).toBe(true);
        expect(isMeasuredWriterValueInScope(expectPrepared(codecs.array(codecs.u8())), Array.from({ length: 256 }).fill(1))).toBe(false);
        expect(isMeasuredWriterValueInScope(expectPrepared(codecs.u8()), 255)).toBe(true);
        expect(isMeasuredWriterValueInScope(expectPrepared(codecs.u8()), 256)).toBe(false);
    });

    test('out-of-scope specialized composite values use safe fallback instead of the trusted writer', () => {
        const codec = codecs.array(codecs.u8());
        const prepared = expectPrepared(codec);
        const tooLong = Array.from({ length: 256 }).fill(1);
        expect(isMeasuredWriterValueInScope(prepared, tooLong)).toBe(false);
        expect(selectPreparedMeasuredWriter(prepared, tooLong)).toBeUndefined();
        expect(bytesToHex(encodeWithSafeWriter(codec, tooLong)).startsWith('00010000')).toBe(true);
    });

    test('unsupported composite shapes do not silently re-enable the generic measured writer', () => {
        const unsupportedTuple = codecs.tuple([codecs.u8(), codecs.u8()]);
        expect(readCodecWitness(unsupportedTuple)).toBeUndefined();
        expect(prepareBinaryCodec(unsupportedTuple)).toBeUndefined();
    });

    test('specialized writer selector is not exported through the public package entrypoint', async () => {
        const publicEntrypoint = await import('../../dist/index.js');
        expect(Object.hasOwn(publicEntrypoint, 'selectPreparedMeasuredWriter')).toBe(false);
    });

    test('safe writer fallback still catches unprepared custom measure/write mismatch', () => {
        const mismatchedCodec: BinaryCodec<Uint8Array> = {
            kind: 'binary',
            measure: () => 1,
            write(writer, value) {
                writer.writeBytes(value);
            },
            read(reader) {
                return reader.readBytes(reader.remainingBytes);
            },
        };
        expect(prepareBinaryCodec(mismatchedCodec)).toBeUndefined();
        expect(() => encodeWithSafeWriter(mismatchedCodec, Uint8Array.from([1, 2]))).toThrow(ShirikaProtocolError);
    });

    test('trusted measured writer keeps finish assertion for internal mismatch tests', () => {
        const ring = createScratchRing(2);
        const writer = unsafeCreateTrustedMeasuredRingBinaryWriter(ring, 0, 1);
        writer.writeU8(1);
        writer.writeU8(2);
        expect(() => writer.finish()).toThrow(/expected 1, wrote 2/);
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
function encodeWithSelectedMeasuredWriter<T>(prepared: PreparedBinaryCodec<T>, value: T): Uint8Array {
    const selection = selectPreparedMeasuredWriter(prepared, value);
    if (selection === undefined) {
        throw new Error(`Expected selected measured writer for ${prepared.witness.signature}`);
    }
    const ring = createScratchRing(selection.payloadLength);
    const writer = unsafeCreateTrustedMeasuredRingBinaryWriter(ring, 0, selection.payloadLength);
    if (selection.strategy === undefined) {
        prepared.write(writer, value);
    } else {
        selection.strategy.write(writer, value, selection.payloadLength);
    }
    writer.finish();
    const bytes = readPayload(ring, selection.payloadLength);
    const reader = new RingBinaryReader(ring, 0, selection.payloadLength);
    prepared.read(reader);
    reader.assertFullyRead();
    return bytes;
}

function createEndpointPair(capacityBytes: number): { readonly left: DuplexEndpoint; readonly right: DuplexEndpoint } {
    const aToB = createRingBufferSab(capacityBytes);
    const bToA = createRingBufferSab(capacityBytes);
    const left = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(aToB, capacityBytes), createWaitStrategy(false), 'codec-witness-left->right'),
        inbound: new SharedRingBuffer(createRingLayout(bToA, capacityBytes), createWaitStrategy(false), 'codec-witness-right->left'),
    });
    const right = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(bToA, capacityBytes), createWaitStrategy(false), 'codec-witness-right->left'),
        inbound: new SharedRingBuffer(createRingLayout(aToB, capacityBytes), createWaitStrategy(false), 'codec-witness-left->right'),
    });
    return { left, right };
}

function createScratchRing(payloadLength: number): SharedRingBuffer {
    const capacityBytes = nextPowerOfTwo(Math.max(MIN_CAPACITY_BYTES, payloadLength, 1));
    const sab = createRingBufferSab(capacityBytes);
    return new SharedRingBuffer(createRingLayout(sab, capacityBytes), createWaitStrategy(false), 'codec-witness-test');
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
function bytesToHex(bytes: Uint8Array): string {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
