import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { formatJsonFixture } from './json-format.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixturePath = path.join(rootDir, 'formal/fixtures/codec-vectors.json');
const distIndexPath = path.join(rootDir, 'dist/index.js');
const distCodecWitnessPath = path.join(rootDir, 'dist/core/codec/witness.js');
const distRingWriterPath = path.join(rootDir, 'dist/core/ring/ring-writer.js');
const prettierConfigPath = path.join(rootDir, '.config/shirika/formatters/prettier.json');
const generatedBy = 'scripts/formal/check-codec-vectors.mjs --write';
const writeMode = process.argv.includes('--write');
process.env.SHIRIKA_RPC_ENABLE_READ_SIDE_ENCODED_PAYLOAD ??= '1';

const api = await import(pathToFileURL(distIndexPath).href).catch((error) => {
    throw new Error('Cannot import dist/index.js; run pnpm run build before checking codec vectors.', { cause: error });
});
const internalCodecWitness = await import(pathToFileURL(distCodecWitnessPath).href).catch((error) => {
    throw new Error('Cannot import dist/core/codec/witness.js; run pnpm run build before checking codec vectors.', { cause: error });
});
const internalRingWriter = await import(pathToFileURL(distRingWriterPath).href).catch((error) => {
    throw new Error('Cannot import dist/core/ring/ring-writer.js; run pnpm run build before checking codec vectors.', { cause: error });
});

const vectors = buildVectorSpecs(api).map((spec) => realizeVector(api, internalCodecWitness, internalRingWriter, spec));
const fixture = {
    version: 1,
    sourceOfTruth: [
        'src/core/codec/builtins.ts',
        'src/core/codec/combinators.ts',
        'src/core/codec/specialized-writers.ts',
        'src/core/codec/specialized-readers.ts',
        'src/core/ring/ring-writer.ts',
        'src/core/ring/ring-reader.ts',
        'src/core/codec/witness.ts',
        'formal/lean/Shirika/Codec/Examples.lean',
    ],
    generatedBy,
    leanBoundary: 'selected simplified codec model; msgpack, full Unicode, and floating-point arithmetic are deferred',
    vectors,
    readSideInvalidCases: buildReadSideInvalidCases(api, internalCodecWitness),
    fallbackCases: buildFallbackCases(api),
};
const expected = await formatJsonFixture(fixture, fixturePath, prettierConfigPath);

if (writeMode) {
    await mkdir(path.dirname(fixturePath), { recursive: true });
    await writeFile(fixturePath, expected);
} else {
    await assertFileEquals(fixturePath, expected);
}

function buildVectorSpecs({ codecs }) {
    const voidCodec = codecs.void();
    const u8 = codecs.u8();
    const u16 = codecs.u16();
    const u32 = codecs.u32();
    const i32 = codecs.i32();
    const bool = codecs.bool();
    const bytes = codecs.bytes();
    const optionalU8 = codecs.optional(u8);
    const optionalBytes = codecs.optional(bytes);
    const arrayU8 = codecs.array(u8);
    const tupleBoolU8 = codecs.tuple([bool, u8]);
    const tupleBoolU16 = codecs.tuple([bool, u16]);
    const arrayTupleBoolU8 = codecs.array(tupleBoolU8);
    const simpleStruct = codecs.struct({ tag: u8, count: u16, ok: bool });
    const nestedStruct = codecs.struct({
        tag: u8,
        maybePayload: optionalBytes,
        pairs: arrayTupleBoolU8,
    });

    return [
        {
            name: 'primitive-void',
            purpose: 'zero-byte void payload has exact measured length',
            leanCodec: 'Shirika.Codec.Builtins.voidCodec',
            leanTheorems: ['Shirika.Codec.Builtins.void_lawful'],
            codec: voidCodec,
            value: undefined,
        },
        {
            name: 'primitive-bool',
            purpose: 'primitive boolean value writes a single presence byte',
            leanCodec: 'Shirika.Codec.Builtins.boolCodec',
            leanTheorems: ['Shirika.Codec.Builtins.bool_lawful'],
            codec: bool,
            value: true,
        },
        {
            name: 'primitive-u8',
            purpose: 'primitive fixed-width one-byte unsigned integer value',
            leanCodec: 'Shirika.Codec.Builtins.u8Codec',
            leanTheorems: ['Shirika.Codec.Builtins.u8_lawful'],
            codec: u8,
            value: 0x7f,
        },
        {
            name: 'primitive-u16',
            purpose: 'primitive fixed-width two-byte little-endian integer value',
            leanCodec: 'Shirika.Codec.Builtins.u16Codec',
            leanTheorems: ['Shirika.Codec.Builtins.u16_lawful'],
            codec: u16,
            value: 0x1234,
        },
        {
            name: 'primitive-u32',
            purpose: 'primitive fixed-width little-endian integer value',
            leanCodec: 'Shirika.Codec.Builtins.u32Codec',
            leanTheorems: ['Shirika.Codec.Builtins.u32_lawful'],
            codec: u32,
            value: 0x12345678,
        },
        {
            name: 'primitive-i32',
            purpose: 'primitive fixed-width little-endian signed integer byte representation',
            leanCodec: 'Shirika.Codec.Builtins.i32Codec',
            leanTheorems: ['Shirika.Codec.Builtins.i32_lawful'],
            codec: i32,
            value: -2,
        },
        {
            name: 'bytes-small',
            purpose: 'selected small length-prefixed bytes payload',
            leanCodec: 'Shirika.Codec.Builtins.bytesCodec',
            leanTheorems: ['Shirika.Codec.Builtins.bytes_encode_length_eq_measure', 'Shirika.Codec.Builtins.bytes_decode_encode'],
            codec: bytes,
            value: Uint8Array.from([0xde, 0xad]),
        },
        {
            name: 'optional-u8-none',
            purpose: 'optional empty value with only a presence byte',
            leanCodec: 'Shirika.Codec.Examples.optionalU8Codec',
            leanTheorems: ['Shirika.Codec.Examples.optionalU8_lawful'],
            codec: optionalU8,
            value: undefined,
        },
        {
            name: 'optional-u8-present',
            purpose: 'optional value with presence byte and primitive payload',
            leanCodec: 'Shirika.Codec.Examples.optionalU8Codec',
            leanTheorems: ['Shirika.Codec.Examples.optionalU8_lawful'],
            codec: optionalU8,
            value: 42,
        },
        {
            name: 'optional-bytes-none',
            purpose: 'optional bytes absent value with only a presence byte',
            leanCodec: 'Shirika.Codec.Combinators.optionalCodec Shirika.Codec.Builtins.bytesCodec',
            leanTheorems: ['Shirika.Codec.Combinators.optional_lawful', 'Shirika.Codec.Builtins.bytes_lawful'],
            codec: optionalBytes,
            value: undefined,
        },
        {
            name: 'optional-bytes-small-present',
            purpose: 'optional selected small length-prefixed bytes payload',
            leanCodec: 'Shirika.Codec.Combinators.optionalCodec Shirika.Codec.Builtins.bytesCodec',
            leanTheorems: ['Shirika.Codec.Combinators.optional_lawful', 'Shirika.Codec.Builtins.bytes_lawful'],
            codec: optionalBytes,
            value: Uint8Array.from([0xca, 0xfe]),
        },
        {
            name: 'array-u8-three-items',
            purpose: 'length-prefixed array with three primitive items',
            leanCodec: 'Shirika.Codec.Examples.arrayU8Codec',
            leanTheorems: ['Shirika.Codec.Examples.arrayU8_lawful'],
            codec: arrayU8,
            value: [1, 2, 255],
        },
        {
            name: 'tuple-bool-u8',
            purpose: 'fixed tuple writes bool and u8 fields in declaration order',
            leanCodec: 'Shirika.Codec.Examples.tupleBoolU8Codec',
            leanTheorems: ['Shirika.Codec.Examples.tupleBoolU8_lawful'],
            codec: tupleBoolU8,
            value: [false, 9],
        },
        {
            name: 'tuple-bool-u16',
            purpose: 'fixed tuple writes fields in declaration order',
            leanCodec: 'Shirika.Codec.Examples.tupleBoolU16Codec',
            leanTheorems: ['Shirika.Codec.Examples.tupleBoolU16_lawful'],
            codec: tupleBoolU16,
            value: [true, 0x1234],
        },
        {
            name: 'array-tuple-bool-u8',
            purpose: 'length-prefixed array of selected tuple fields',
            leanCodec: 'Shirika.Codec.Combinators.arrayCodec Shirika.Codec.Examples.tupleBoolU8Codec',
            leanTheorems: ['Shirika.Codec.Combinators.array_lawful', 'Shirika.Codec.Examples.tupleBoolU8_lawful'],
            codec: arrayTupleBoolU8,
            value: [
                [true, 1],
                [false, 2],
            ],
        },
        {
            name: 'struct-simple',
            purpose: 'representative struct writes fields in Object.entries declaration order',
            leanCodec: 'Shirika.Codec.Examples.simpleStructCodec',
            leanTheorems: ['Shirika.Codec.Examples.simpleStruct_lawful'],
            codec: simpleStruct,
            value: { tag: 7, count: 0x1234, ok: true },
        },
        {
            name: 'struct-nested-optional-bytes-array-tuple',
            purpose: 'nested representative struct with optional bytes and array of tuple fields',
            leanCodec: 'Shirika.Codec.Examples.representativeStructCodec',
            leanTheorems: ['Shirika.Codec.Examples.representativeStruct_encode_length_eq_measure', 'Shirika.Codec.Examples.representativeStruct_decode_encode'],
            codec: nestedStruct,
            value: {
                tag: 9,
                maybePayload: Uint8Array.from([0xde, 0xad]),
                pairs: [
                    [true, 1],
                    [false, 2],
                ],
            },
        },
    ];
}

function realizeVector(api, internalCodecWitness, internalRingWriter, spec) {
    const encoded = encodeWithRuntimeWriter(api, spec.codec, spec.value);
    const decoded = decodeWithRuntimeReader(api, spec.codec, encoded);
    assertNormalizedEqual(decoded, spec.value, `${spec.name} decoded value`);
    const measure = spec.codec.measure(spec.value);
    if (measure !== encoded.byteLength) {
        throw new Error(`${spec.name} measure mismatch: measure=${measure}, encoded=${encoded.byteLength}`);
    }
    const prepared = api.prepareBinaryCodec(spec.codec);
    if (prepared === undefined) {
        throw new Error(`${spec.name} expected a PreparedBinaryCodec witness`);
    }
    const witness = prepared.witness;
    const measuredWriterValueInScope = api.isMeasuredWriterValueInScope(prepared, spec.value);
    const selectedMeasuredWriter = internalCodecWitness.selectPreparedMeasuredWriter(prepared, spec.value);
    if (witness.measuredWriterFastPath && !measuredWriterValueInScope) {
        throw new Error(`${spec.name} measured-writer-enabled prepared codec rejected its conformance value`);
    }
    if (!witness.measuredWriterFastPath && measuredWriterValueInScope) {
        throw new Error(`${spec.name} measured-writer-disabled prepared codec unexpectedly accepted the fast path`);
    }
    if (witness.measuredWriterFastPath && selectedMeasuredWriter === undefined) {
        throw new Error(`${spec.name} measured-writer-enabled prepared codec did not select a writer strategy`);
    }
    if (!witness.conformanceVectors.includes(spec.name)) {
        throw new Error(`${spec.name} is missing from witness conformance vectors for ${witness.signature}`);
    }
    const selectedMeasuredWriterVector =
        selectedMeasuredWriter === undefined
            ? undefined
            : realizeSelectedMeasuredWriterVector(api, internalRingWriter, prepared, spec.value, encoded, selectedMeasuredWriter, spec.name);
    const validatedReadSideVector = witness.readSideValidation
        ? realizeReadSideVector(api, internalCodecWitness, prepared, encoded, spec.value, spec.name)
        : undefined;
    return {
        name: spec.name,
        purpose: spec.purpose,
        codecSignature: api.describeCodec(spec.codec),
        prepared: true,
        measuredWriterFastPath: witness.measuredWriterFastPath,
        measuredWriterValueInScope,
        readSideValidation: witness.readSideValidation,
        readSideStrategyId: witness.readSideStrategyId,
        valueScope: witness.valueScope,
        leanCodec: spec.leanCodec,
        leanTheorems: spec.leanTheorems,
        codecWitness: normalizeWitness(witness),
        value: normalizeValue(spec.value),
        measure,
        encodedLength: encoded.byteLength,
        encodedHex: bytesToHex(encoded),
        selectedMeasuredWriter: selectedMeasuredWriterVector,
        validatedReadSide: validatedReadSideVector,
        decodedValue: normalizeValue(decoded),
    };
}

function buildReadSideInvalidCases(api, internalCodecWitness) {
    const specs = buildVectorSpecs(api).filter((spec) => api.prepareBinaryCodec(spec.codec)?.witness.readSideValidation === true);
    const cases = [];
    for (const spec of specs) {
        const prepared = api.prepareBinaryCodec(spec.codec);
        if (prepared === undefined) {
            throw new Error(`${spec.name} lost its PreparedBinaryCodec witness`);
        }
        const encoded = encodeWithRuntimeWriter(api, spec.codec, spec.value);
        const invalidInputs = [{ label: 'trailing', encoded: appendByte(encoded, 0xff) }];
        if (encoded.byteLength > 0) {
            invalidInputs.unshift({ label: 'too-short', encoded: encoded.slice(0, encoded.byteLength - 1) });
        }
        for (const invalid of invalidInputs) {
            const safeError = captureError(() => decodeWithRuntimeReader(api, prepared, invalid.encoded));
            const readSideError = captureError(() => decodeWithValidatedReadSide(api, internalCodecWitness, prepared, invalid.encoded));
            if (safeError.name !== readSideError.name || safeError.message !== readSideError.message) {
                throw new Error(
                    `${spec.name}/${invalid.label} changed error classification: safe=${safeError.name}:${safeError.message} readSide=${readSideError.name}:${readSideError.message}`,
                );
            }
            cases.push({
                name: `${spec.name}-${invalid.label}`,
                codecSignature: api.describeCodec(spec.codec),
                strategyId: prepared.witness.readSideStrategyId,
                invalidKind: invalid.label,
                encodedHex: bytesToHex(invalid.encoded),
                errorName: readSideError.name,
                errorMessage: readSideError.message,
            });
        }
    }
    return cases;
}

function buildFallbackCases(api) {
    const forgedU32 = api.defineCodecSignature(
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
    const forgedBytes = api.defineCodecSignature(
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
    const mismatchedCustom = {
        kind: 'binary',
        measure: () => 1,
        write(writer, value) {
            writer.writeBytes(value);
        },
        read(reader) {
            return reader.readBytes(reader.remainingBytes);
        },
    };
    if (api.prepareBinaryCodec(forgedU32) !== undefined) {
        throw new Error('Forged u32 signature unexpectedly produced a PreparedBinaryCodec');
    }
    if (api.prepareBinaryCodec(forgedBytes) !== undefined) {
        throw new Error('Forged bytes signature unexpectedly produced a PreparedBinaryCodec');
    }
    if (api.prepareBinaryCodec(mismatchedCustom) !== undefined) {
        throw new Error('Unbranded custom codec unexpectedly produced a PreparedBinaryCodec');
    }
    let safeWriterRejectedMismatch = false;
    try {
        encodeWithRuntimeWriter(api, mismatchedCustom, Uint8Array.from([1, 2]));
    } catch {
        safeWriterRejectedMismatch = true;
    }
    if (!safeWriterRejectedMismatch) {
        throw new Error('Safe writer did not reject custom measure/write mismatch');
    }
    return [
        {
            name: 'custom-forged-u32-signature',
            purpose: 'codec signatures alone are not enough to create a writer fast-path witness',
            codecSignature: api.describeCodec(forgedU32),
            prepared: false,
            safeFallback: true,
        },
        {
            name: 'custom-forged-bytes-signature',
            purpose: 'aligned bytes payload fast path requires the internal bytes witness, not just a public signature',
            codecSignature: api.describeCodec(forgedBytes),
            prepared: false,
            safeFallback: true,
        },
        {
            name: 'custom-measure-write-mismatch',
            purpose: 'custom codec without witness remains on checked writer fallback and mismatch is rejected',
            codecSignature: api.describeCodec(mismatchedCustom),
            prepared: false,
            safeFallback: true,
            safeWriterRejectedMismatch,
        },
    ];
}

function normalizeWitness(witness) {
    return {
        codecKind: witness.codecKind,
        signature: witness.signature,
        leanCodec: witness.leanCodec,
        leanTheorems: [...witness.leanTheorems],
        conformanceVectors: [...witness.conformanceVectors],
        valueScope: witness.valueScope,
        measuredWriterFastPath: witness.measuredWriterFastPath,
        readSideValidation: witness.readSideValidation,
        readSideStrategyId: witness.readSideStrategyId,
        components: witness.components.map((component) => ({
            signature: component.signature,
            leanCodec: component.leanCodec,
            leanTheorems: [...component.leanTheorems],
        })),
    };
}

function encodeWithRuntimeWriter(api, codec, value) {
    const payloadLength = codec.measure(value);
    const ring = createScratchRing(api, payloadLength);
    const writer = new api.RingBinaryWriter(ring, 0, payloadLength);
    codec.write(writer, value);
    writer.finish();
    const encoded = new Uint8Array(payloadLength);
    ring.readInto(0, encoded, 0, payloadLength);
    return encoded;
}

function decodeWithRuntimeReader(api, codec, encoded) {
    const ring = createScratchRing(api, encoded.byteLength);
    ring.writeBytes(0, encoded);
    const reader = new api.RingBinaryReader(ring, 0, encoded.byteLength);
    const decoded = codec.read(reader);
    reader.assertFullyRead();
    return decoded;
}

function realizeReadSideVector(api, internalCodecWitness, prepared, encoded, expectedValue, name) {
    const decoded = decodeWithValidatedReadSide(api, internalCodecWitness, prepared, encoded);
    assertNormalizedEqual(decoded.value, expectedValue, `${name} validated read-side decoded value`);
    return {
        strategyId: decoded.witness.strategyId,
        payloadLength: decoded.witness.payloadLength,
        decodedValue: normalizeValue(decoded.value),
    };
}

function decodeWithValidatedReadSide(api, internalCodecWitness, prepared, encoded) {
    const ring = createScratchRing(api, encoded.byteLength);
    ring.writeBytes(0, encoded);
    const decoded = internalCodecWitness.validateAndDecodePreparedEncodedPayload(prepared, ring, {
        payloadSeq: 0,
        payloadLength: encoded.byteLength,
    });
    if (decoded === undefined) {
        throw new Error(`${prepared.witness.signature} does not have a read-side validation strategy`);
    }
    return decoded;
}

function realizeSelectedMeasuredWriterVector(api, internalRingWriter, prepared, value, expectedEncoded, selection, name) {
    const ring = createScratchRing(api, selection.payloadLength);
    const writer = internalRingWriter.unsafeCreateTrustedMeasuredRingBinaryWriter(ring, 0, selection.payloadLength);
    if (selection.strategy === undefined) {
        prepared.write(writer, value);
    } else {
        selection.strategy.write(writer, value, selection.payloadLength);
    }
    writer.finish();
    const encoded = new Uint8Array(selection.payloadLength);
    ring.readInto(0, encoded, 0, selection.payloadLength);
    if (selection.payloadLength !== expectedEncoded.byteLength) {
        throw new Error(`${name} selected measured writer length mismatch: selected=${selection.payloadLength}, encoded=${expectedEncoded.byteLength}`);
    }
    if (!isDeepStrictEqual(encoded, expectedEncoded)) {
        throw new Error(`${name} selected measured writer encoded different bytes: selected=${bytesToHex(encoded)}, safe=${bytesToHex(expectedEncoded)}`);
    }
    const reader = new api.RingBinaryReader(ring, 0, selection.payloadLength);
    prepared.read(reader);
    reader.assertFullyRead();
    return {
        strategyId: selection.strategyId,
        measuredLength: selection.payloadLength,
        encodedHex: bytesToHex(encoded),
    };
}

function createScratchRing(api, payloadLength) {
    const capacityBytes = nextPowerOfTwo(Math.max(api.MIN_CAPACITY_BYTES, payloadLength, 1));
    const sab = api.createRingBufferSab(capacityBytes);
    return new api.SharedRingBuffer(api.createRingLayout(sab, capacityBytes), api.createWaitStrategy(false), 'codec-vector-scratch');
}

function nextPowerOfTwo(value) {
    let result = 1;
    while (result < value) {
        result *= 2;
    }
    return result;
}

function normalizeValue(value) {
    if (value instanceof Uint8Array) {
        return { type: 'Uint8Array', hex: bytesToHex(value) };
    }
    if (Array.isArray(value)) {
        return value.map((item) => normalizeValue(item));
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(
            Object.keys(value)
                .sort()
                .map((key) => [key, normalizeValue(value[key])]),
        );
    }
    if (value === undefined) {
        return { type: 'undefined' };
    }
    return value;
}

function assertNormalizedEqual(actual, expected, label) {
    const normalizedActual = normalizeValue(actual);
    const normalizedExpected = normalizeValue(expected);
    if (!isDeepStrictEqual(normalizedActual, normalizedExpected)) {
        throw new Error(`${label} mismatch:\nactual=${stableJson(normalizedActual)}\nexpected=${stableJson(normalizedExpected)}`);
    }
}

function appendByte(bytes, byte) {
    const result = new Uint8Array(bytes.byteLength + 1);
    result.set(bytes);
    result[bytes.byteLength] = byte;
    return result;
}

function captureError(run) {
    try {
        run();
    } catch (error) {
        return {
            name: error?.name ?? error?.constructor?.name ?? 'Error',
            message: error?.message ?? String(error),
        };
    }
    throw new Error('Expected an invalid payload error');
}

function bytesToHex(bytes) {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function stableJson(value) {
    return JSON.stringify(value, null, 2);
}

async function assertFileEquals(filePath, expected) {
    let actual;
    try {
        actual = await readFile(filePath, 'utf8');
    } catch (error) {
        throw new Error(`${path.relative(rootDir, filePath)} is missing; run pnpm run formal:codecs:update`, { cause: error });
    }
    if (actual !== expected) {
        throw new Error(`${path.relative(rootDir, filePath)} is stale; run pnpm run formal:codecs:update`);
    }
}
