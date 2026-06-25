import { afterEach, describe, expect, test } from 'vitest';
import { type EncodedPayloadRange, isMeasuredWriterValueInScope, validateAndDecodePreparedEncodedPayload } from '../../dist/core/codec/witness.js';
import {
    FAST_PATH_FLAGS,
    FAST_PATH_POLICY,
    getFastPathStrategy,
    setFastPathStrategyForTest,
    withFastPathStrategyForTest,
} from '../../dist/core/fast-path-strategy.js';
import type { BinaryCodec, PreparedBinaryCodec } from '../../dist/index.js';
import {
    codecs,
    createRingBufferSab,
    createRingLayout,
    createWaitStrategy,
    MIN_CAPACITY_BYTES,
    prepareBinaryCodec,
    RingBinaryWriter,
    SharedRingBuffer,
} from '../../dist/index.js';

describe('internal fast-path strategy and kill-switches', () => {
    afterEach(() => {
        setFastPathStrategyForTest(undefined);
    });

    test('policy covers every runtime fast-path flag with a fallback and kill-switch pair', () => {
        expect(FAST_PATH_FLAGS).toEqual([
            'preparedContractReuse',
            'validatedFrameWitness',
            'validatedAlignedBytesPayload',
            'preparedBinaryCodecWriter',
            'specializedCompositeWriter',
            'readSideEncodedPayload',
            'pendingRequestWitness',
        ]);
        for (const flag of FAST_PATH_FLAGS) {
            const policy = FAST_PATH_POLICY.find((entry) => entry.flag === flag);
            expect(policy, flag).toBeDefined();
            expect(policy?.fallback.length, flag).toBeGreaterThan(24);
            expect(policy?.killSwitch.disableEnv, flag).toMatch(/^SHIRIKA_RPC_DISABLE_/);
            expect(policy?.killSwitch.enableEnv, flag).toMatch(/^SHIRIKA_RPC_ENABLE_/);
            expect(policy?.conformanceVectors.length, flag).toBeGreaterThan(0);
            expect(policy?.benchmarkSuites.length, flag).toBeGreaterThan(0);
        }
    });

    test('safe mode disables all proof-backed fast paths and experimental mode enables the manual read-side path', () => {
        setFastPathStrategyForTest({ mode: 'safe' });
        const safe = getFastPathStrategy();
        for (const flag of FAST_PATH_FLAGS) {
            expect(safe[flag], flag).toBe(false);
        }
        setFastPathStrategyForTest({ mode: 'experimental' });
        const experimental = getFastPathStrategy();
        for (const flag of FAST_PATH_FLAGS) {
            expect(experimental[flag], flag).toBe(true);
        }
    });

    test('prepared writer kill-switch routes selected codecs to checked writer scope', () => {
        const prepared = expectPrepared(codecs.u32());
        expect(isMeasuredWriterValueInScope(prepared, 7)).toBe(true);
        withFastPathStrategyForTest({ preparedBinaryCodecWriter: false }, () => {
            expect(isMeasuredWriterValueInScope(prepared, 7)).toBe(false);
        });
    });

    test('read-side encoded payload specialization is disabled by default and opt-in for conformance/bench runs', () => {
        const prepared = expectPrepared(codecs.u32());
        const encoded = encodeWithSafeWriter(prepared, 0x12345678);
        setFastPathStrategyForTest({ readSideEncodedPayload: false });
        expect(decodeWithValidatedPayloadOrUndefined(prepared, encoded)).toBeUndefined();
        setFastPathStrategyForTest({ readSideEncodedPayload: true });
        expect(decodeWithValidatedPayloadOrUndefined(prepared, encoded)?.value).toBe(0x12345678);
    });
});

function expectPrepared<T>(codec: BinaryCodec<T>): PreparedBinaryCodec<T> {
    const prepared = prepareBinaryCodec(codec);
    if (prepared === undefined) {
        throw new Error('Expected prepared codec');
    }
    return prepared;
}

function encodeWithSafeWriter<T>(codec: PreparedBinaryCodec<T>, value: T): Uint8Array {
    const payloadLength = codec.measure(value);
    const ring = createScratchRing(payloadLength);
    const writer = new RingBinaryWriter(ring, 0, payloadLength);
    codec.write(writer, value);
    writer.finish();
    const out = new Uint8Array(payloadLength);
    ring.readInto(0, out, 0, payloadLength);
    return out;
}

function decodeWithValidatedPayloadOrUndefined<T>(codec: PreparedBinaryCodec<T>, encoded: Uint8Array) {
    const ring = createScratchRing(encoded.byteLength);
    ring.writeBytes(0, encoded);
    const range: EncodedPayloadRange = { payloadSeq: 0, payloadLength: encoded.byteLength };
    return validateAndDecodePreparedEncodedPayload(codec, ring, range);
}

function createScratchRing(payloadLength: number): SharedRingBuffer {
    const capacityBytes = nextPowerOfTwo(Math.max(MIN_CAPACITY_BYTES, payloadLength, 1));
    return new SharedRingBuffer(createRingLayout(createRingBufferSab(capacityBytes), capacityBytes), createWaitStrategy(false), 'fast-path-strategy-test');
}

function nextPowerOfTwo(value: number): number {
    let result = 1;
    while (result < value) {
        result *= 2;
    }
    return result;
}
