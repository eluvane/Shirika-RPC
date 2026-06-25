import { performance } from 'node:perf_hooks';
import { validateAndDecodePreparedEncodedPayload } from '../dist/core/codec/witness.js';
import {
    codecs,
    createRingBufferSab,
    createRingLayout,
    createWaitStrategy,
    DuplexEndpoint,
    FRAME_MAGIC,
    FRAME_VERSION,
    HEADER_SIZE,
    MIN_CAPACITY_BYTES,
    Opcode,
    prepareBinaryCodec,
    RingBinaryReader,
    RingBinaryWriter,
    SharedRingBuffer,
} from '../dist/index.js';
import { formatNumber, readCliOption, renderMarkdownTable, writeJsonFile, writeTextFile } from '../scripts/bench/reporting.mjs';

process.env.SHIRIKA_RPC_ENABLE_READ_SIDE_ENCODED_PAYLOAD ??= '1';
const CONTROL_INDEX = {
    READ_SEQ: 0,
    WRITE_SEQ: 1,
};
const argv = process.argv.slice(2);
const iterations = readPositiveInteger(argv, '--iterations') ?? 100_000;
const warmupIterations = readPositiveInteger(argv, '--warmup') ?? 10_000;
const samples = readPositiveInteger(argv, '--samples') ?? 25;
const jsonOut = readCliOption(argv, '--json-out');
const markdownOut = readCliOption(argv, '--markdown-out');

const tupleCodec = codecs.tuple([codecs.bool(), codecs.u16()]);
const simpleStructCodec = codecs.struct({ tag: codecs.u8(), count: codecs.u16(), ok: codecs.bool() });
const tupleValue = [true, 0x1234];
const simpleStructValue = { tag: 7, count: 0x1234, ok: true };

const report = {
    schemaVersion: 1,
    suite: 'codec-read-fast-path',
    generatedAt: new Date().toISOString(),
    runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
    },
    benchmark: {
        iterations,
        warmupIterations,
        samples,
    },
    cases: [],
    comparisons: [],
};

const cases = [
    directReadCase('direct-u32-safe-reader', 'u32 direct safe reader', 'primitive fixed-width', codecs.u32(), 0x12345678, 'safe'),
    directReadCase('direct-u32-validated-read-side', 'u32 direct validated read-side', 'primitive fixed-width', codecs.u32(), 0x12345678, 'validated'),
    directReadCase('direct-tuple-safe-reader', 'tuple(bool,u16) direct safe reader', 'tuple of primitives', tupleCodec, tupleValue, 'safe'),
    directReadCase(
        'direct-tuple-validated-read-side',
        'tuple(bool,u16) direct validated read-side',
        'tuple of primitives',
        tupleCodec,
        tupleValue,
        'validated',
    ),
    directReadCase('direct-struct-safe-reader', 'struct direct safe reader', 'representative simple struct', simpleStructCodec, simpleStructValue, 'safe'),
    directReadCase(
        'direct-struct-validated-read-side',
        'struct direct validated read-side',
        'representative simple struct',
        simpleStructCodec,
        simpleStructValue,
        'validated',
    ),
    frameReadCase('frame-struct-safe-fallback', 'frame struct safe reader fallback', 'frame read simple struct', simpleStructCodec, simpleStructValue, 'safe'),
    frameReadCase(
        'frame-struct-validated-read-side',
        'frame struct validated read-side',
        'frame read simple struct',
        simpleStructCodec,
        simpleStructValue,
        'validated',
    ),
];

console.log('# codec-read-fast-path benchmark');
console.log(`runtime=${process.version} iterations=${iterations} warmup=${warmupIterations} samples=${samples}`);
for (const entry of cases) {
    await runCase(entry, warmupIterations, Math.min(samples, 5));
    const measured = await runCase(entry, iterations, samples);
    report.cases.push(measured);
    const metrics = measured.metrics;
    console.log(
        `${entry.label.padEnd(44)} ops/sec=${formatNumber(metrics.opsPerSec)} avg=${formatNumber(metrics.avgMs)}ms p95=${formatNumber(
            metrics.p95Ms,
        )}ms heapDelta=${metrics.heapDeltaBytes}`,
    );
}
compareCases('direct-u32-validated-vs-safe', 'u32 direct validated read-side vs safe', 'direct-u32-safe-reader', 'direct-u32-validated-read-side');
compareCases('direct-tuple-validated-vs-safe', 'tuple direct validated read-side vs safe', 'direct-tuple-safe-reader', 'direct-tuple-validated-read-side');
compareCases('direct-struct-validated-vs-safe', 'struct direct validated read-side vs safe', 'direct-struct-safe-reader', 'direct-struct-validated-read-side');
compareCases('frame-struct-validated-vs-safe', 'frame struct validated read-side vs safe', 'frame-struct-safe-fallback', 'frame-struct-validated-read-side');
await writeJsonFile(jsonOut, report);
await writeTextFile(markdownOut, `${renderMarkdown(report)}\n`);

function directReadCase(id, label, group, codec, value, mode) {
    const prepared = requiredPrepared(codec);
    if (mode === 'validated' && !prepared.witness.readSideValidation) {
        throw new Error(`Expected read-side validation for ${label}`);
    }
    const encoded = encodeWithSafeWriter(codec, value);
    const ring = createScratchRing(encoded.byteLength);
    ring.writeBytes(0, encoded);
    return {
        id,
        label,
        group,
        strategy: mode === 'safe' ? 'safe-ring-binary-reader' : prepared.witness.readSideStrategyId,
        async run() {
            if (mode === 'safe') {
                const reader = new RingBinaryReader(ring, 0, encoded.byteLength);
                codec.read(reader);
                reader.assertFullyRead();
                return;
            }
            const decoded = validateAndDecodePreparedEncodedPayload(prepared, ring, { payloadSeq: 0, payloadLength: encoded.byteLength });
            if (decoded === undefined) {
                throw new Error(`Missing validated read-side decoder for ${label}`);
            }
        },
    };
}

function frameReadCase(id, label, group, codec, value, mode) {
    const prepared = requiredPrepared(codec);
    const selectedCodec = mode === 'validated' ? prepared : wrapUnpreparedBinaryCodec(codec);
    const encoded = encodeWithSafeWriter(codec, value);
    const frameSize = align8(HEADER_SIZE + encoded.byteLength);
    const capacityBytes = nextPowerOfTwo(Math.max(MIN_CAPACITY_BYTES, frameSize + 64));
    const frameBytes = new Uint8Array(frameSize);
    frameBytes.set(
        encodeFrameHeader({
            magic: FRAME_MAGIC,
            version: FRAME_VERSION,
            opcode: Opcode.REQUEST,
            flags: 0,
            requestId: 1,
            methodId: 1,
            statusCode: 0,
            payloadLength: encoded.byteLength,
            reserved: 0,
        }),
    );
    frameBytes.set(encoded, HEADER_SIZE);
    const inboundSab = createRingBufferSab(capacityBytes);
    const outboundSab = createRingBufferSab(capacityBytes);
    const endpoint = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(outboundSab, capacityBytes), createWaitStrategy(false), 'codec-read-bench-out'),
        inbound: new SharedRingBuffer(createRingLayout(inboundSab, capacityBytes), createWaitStrategy(false), 'codec-read-bench-in'),
    });
    return {
        id,
        label,
        group,
        strategy: mode === 'safe' ? 'safe-reader-fallback' : prepared.witness.readSideStrategyId,
        async run(index) {
            publishFrame(endpoint.inbound, (index * frameSize) >>> 0, frameBytes, frameSize);
            const frame = await endpoint.receive();
            frame.readWithCodec(selectedCodec);
        },
    };
}

async function runCase(entry, count, sampleCount) {
    const batchSize = Math.max(1, Math.floor(count / sampleCount));
    const sampleDurations = [];
    const heapBefore = process.memoryUsage().heapUsed;
    let remaining = count;
    let index = 0;
    const startedAt = performance.now();
    while (remaining > 0) {
        const batch = Math.min(batchSize, remaining);
        const batchStartedAt = performance.now();
        for (let item = 0; item < batch; item += 1) {
            await entry.run(index);
            index += 1;
        }
        const batchMs = performance.now() - batchStartedAt;
        sampleDurations.push(batchMs / batch);
        remaining -= batch;
    }
    const totalMs = performance.now() - startedAt;
    const heapAfter = process.memoryUsage().heapUsed;
    return {
        id: entry.id,
        label: entry.label,
        group: entry.group,
        strategy: entry.strategy,
        metrics: {
            totalMs,
            opsPerSec: totalMs <= 0 ? 0 : count / (totalMs / 1000),
            avgMs: totalMs / count,
            p95Ms: percentile(sampleDurations, 95),
            heapDeltaBytes: heapAfter - heapBefore,
        },
    };
}

function compareCases(id, label, beforeId, afterId) {
    const before = report.cases.find((entry) => entry.id === beforeId);
    const after = report.cases.find((entry) => entry.id === afterId);
    if (!before || !after) {
        throw new Error(`Cannot compare missing benchmark cases ${beforeId} and ${afterId}`);
    }
    const throughputImprovementPct = ((after.metrics.opsPerSec - before.metrics.opsPerSec) / before.metrics.opsPerSec) * 100;
    const latencyReductionPct = ((before.metrics.avgMs - after.metrics.avgMs) / before.metrics.avgMs) * 100;
    const comparison = {
        id,
        label,
        before: beforeId,
        after: afterId,
        throughputImprovementPct,
        latencyReductionPct,
    };
    report.comparisons.push(comparison);
    console.log(`${label.padEnd(44)} latencyReduction=${formatNumber(latencyReductionPct)}% throughputImprovement=${formatNumber(throughputImprovementPct)}%`);
}

function encodeWithSafeWriter(codec, value) {
    const payloadLength = codec.measure(value);
    const ring = createScratchRing(payloadLength);
    const writer = new RingBinaryWriter(ring, 0, payloadLength);
    codec.write(writer, value);
    writer.finish();
    const encoded = new Uint8Array(payloadLength);
    ring.readInto(0, encoded, 0, payloadLength);
    return encoded;
}

function requiredPrepared(codec) {
    const prepared = prepareBinaryCodec(codec);
    if (prepared === undefined) {
        throw new Error('Expected prepared codec for benchmark case');
    }
    return prepared;
}

function wrapUnpreparedBinaryCodec(codec) {
    return {
        kind: 'binary',
        measure(value) {
            return codec.measure(value);
        },
        write(writer, value) {
            codec.write(writer, value);
        },
        read(reader) {
            return codec.read(reader);
        },
    };
}

function createScratchRing(payloadLength) {
    const capacityBytes = nextPowerOfTwo(Math.max(MIN_CAPACITY_BYTES, payloadLength, 1));
    const sab = createRingBufferSab(capacityBytes);
    return new SharedRingBuffer(createRingLayout(sab, capacityBytes), createWaitStrategy(false), 'codec-read-bench-scratch');
}

function publishFrame(ring, readSeq, frameBytes, frameSize) {
    Atomics.store(ring.control, CONTROL_INDEX.READ_SEQ, readSeq | 0);
    Atomics.store(ring.control, CONTROL_INDEX.WRITE_SEQ, readSeq | 0);
    ring.writeBytes(readSeq, frameBytes, 0, frameSize);
    ring.commitWrite((readSeq + frameSize) | 0);
}

function encodeFrameHeader(header) {
    const bytes = new Uint8Array(HEADER_SIZE);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint32(0, header.magic, true);
    view.setUint16(4, header.version, true);
    view.setUint16(6, header.opcode, true);
    view.setUint32(8, header.flags, true);
    view.setUint32(12, header.requestId, true);
    view.setUint32(16, header.methodId, true);
    view.setInt32(20, header.statusCode, true);
    view.setUint32(24, header.payloadLength, true);
    view.setUint32(28, header.reserved, true);
    return bytes;
}

function align8(value) {
    return Math.ceil(value / 8) * 8;
}

function nextPowerOfTwo(value) {
    let result = 1;
    while (result < value) {
        result *= 2;
    }
    return result;
}

function percentile(values, percentileValue) {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((left, right) => left - right);
    const index = Math.min(sorted.length - 1, Math.floor((percentileValue / 100) * sorted.length));
    return sorted[index] ?? 0;
}

function readPositiveInteger(args, flag) {
    const rawValue = readCliOption(args, flag);
    if (rawValue === undefined) {
        return undefined;
    }
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value <= 0) {
        throw new TypeError(`${flag} must be a positive integer, received ${rawValue}`);
    }
    return value;
}

function renderMarkdown(data) {
    return [
        '# Codec read fast path benchmark',
        '',
        `Generated at: ${data.generatedAt}`,
        `Node: ${data.runtime.node}`,
        `Iterations: ${data.benchmark.iterations}`,
        '',
        renderMarkdownTable(
            ['Case', 'Strategy', 'ops/sec', 'avg ms', 'p95 ms', 'heap delta bytes'],
            data.cases.map((entry) => [
                entry.label,
                entry.strategy ?? '',
                formatNumber(entry.metrics.opsPerSec),
                formatNumber(entry.metrics.avgMs),
                formatNumber(entry.metrics.p95Ms),
                String(entry.metrics.heapDeltaBytes),
            ]),
        ),
        '',
        renderMarkdownTable(
            ['Comparison', 'latency reduction %', 'throughput improvement %'],
            data.comparisons.map((entry) => [entry.label, formatNumber(entry.latencyReductionPct), formatNumber(entry.throughputImprovementPct)]),
        ),
    ].join('\n');
}
