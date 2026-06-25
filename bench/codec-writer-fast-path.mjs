import { performance } from 'node:perf_hooks';
import { selectPreparedMeasuredWriter } from '../dist/core/codec/witness.js';
import { unsafeCreateTrustedMeasuredRingBinaryWriter } from '../dist/core/ring/ring-writer.js';
import {
    codecs,
    createRingBufferSab,
    createRingLayout,
    createWaitStrategy,
    DuplexEndpoint,
    MIN_CAPACITY_BYTES,
    Opcode,
    prepareBinaryCodec,
    RingBinaryWriter,
    SharedRingBuffer,
} from '../dist/index.js';
import { formatNumber, readCliOption, renderMarkdownTable, writeJsonFile, writeTextFile } from '../scripts/bench/reporting.mjs';

const argv = process.argv.slice(2);
const iterations = readPositiveInteger(argv, '--iterations') ?? 50_000;
const warmupIterations = readPositiveInteger(argv, '--warmup') ?? 5_000;
const samples = readPositiveInteger(argv, '--samples') ?? 25;
const jsonOut = readCliOption(argv, '--json-out');
const markdownOut = readCliOption(argv, '--markdown-out');
const smallStructCodec = codecs.struct({ tag: codecs.u8(), count: codecs.u16(), ok: codecs.bool() });
const nestedStructCodec = codecs.struct({
    tag: codecs.u8(),
    maybePayload: codecs.optional(codecs.bytes()),
    pairs: codecs.array(codecs.tuple([codecs.bool(), codecs.u8()])),
});
const smallStructValue = { tag: 7, count: 0x1234, ok: true };
const nestedStructValue = {
    tag: 9,
    maybePayload: patternedBytes(64),
    pairs: Array.from({ length: 64 }, (_, index) => [index % 2 === 0, index & 0xff]),
};
const report = {
    schemaVersion: 2,
    suite: 'codec-writer-fast-path',
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
    directWriterCase('direct-u32-safe-writer', 'u32 direct safe writer', 'primitive fixed-width', codecs.u32(), 0x12345678, 'safe'),
    directWriterCase('direct-u32-trusted-writer', 'u32 direct trusted measured writer', 'primitive fixed-width', codecs.u32(), 0x12345678, 'generic-trusted'),
    directWriterCase('direct-struct-safe-writer', 'struct direct safe writer', 'representative struct', smallStructCodec, smallStructValue, 'safe'),
    directWriterCase(
        'direct-struct-generic-trusted-writer',
        'struct direct generic trusted writer',
        'representative struct',
        smallStructCodec,
        smallStructValue,
        'generic-trusted',
    ),
    directWriterCase(
        'direct-struct-specialized-writer',
        'struct direct specialized writer',
        'representative struct',
        smallStructCodec,
        smallStructValue,
        'selected',
    ),
    directWriterCase('direct-nested-safe-writer', 'nested direct safe writer', 'nested optional/array/tuple', nestedStructCodec, nestedStructValue, 'safe'),
    directWriterCase(
        'direct-nested-generic-trusted-writer',
        'nested direct generic trusted writer',
        'nested optional/array/tuple',
        nestedStructCodec,
        nestedStructValue,
        'generic-trusted',
    ),
    directWriterCase(
        'direct-nested-specialized-writer',
        'nested direct specialized writer',
        'nested optional/array/tuple',
        nestedStructCodec,
        nestedStructValue,
        'selected',
    ),
    await frameCase('frame-struct-safe-fallback', 'frame struct safe fallback', 'frame send small payload', smallStructCodec, smallStructValue, false),
    await frameCase(
        'frame-struct-prepared-specialized',
        'frame struct prepared specialized writer',
        'frame send small payload',
        smallStructCodec,
        smallStructValue,
        true,
    ),
    await frameCase('frame-nested-safe-fallback', 'frame nested safe fallback', 'frame send medium payload', nestedStructCodec, nestedStructValue, false),
    await frameCase(
        'frame-nested-prepared-specialized',
        'frame nested prepared specialized writer',
        'frame send medium payload',
        nestedStructCodec,
        nestedStructValue,
        true,
    ),
];

console.log('# codec-writer-fast-path benchmark');
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
compareCases('direct-u32-trusted-vs-safe', 'u32 direct trusted measured vs safe', 'direct-u32-safe-writer', 'direct-u32-trusted-writer');
compareCases('direct-struct-generic-vs-safe', 'struct direct generic trusted vs safe', 'direct-struct-safe-writer', 'direct-struct-generic-trusted-writer');
compareCases('direct-struct-specialized-vs-safe', 'struct direct specialized vs safe', 'direct-struct-safe-writer', 'direct-struct-specialized-writer');
compareCases(
    'direct-struct-specialized-vs-generic',
    'struct direct specialized vs generic trusted',
    'direct-struct-generic-trusted-writer',
    'direct-struct-specialized-writer',
);
compareCases('direct-nested-generic-vs-safe', 'nested direct generic trusted vs safe', 'direct-nested-safe-writer', 'direct-nested-generic-trusted-writer');
compareCases('direct-nested-specialized-vs-safe', 'nested direct specialized vs safe', 'direct-nested-safe-writer', 'direct-nested-specialized-writer');
compareCases(
    'direct-nested-specialized-vs-generic',
    'nested direct specialized vs generic trusted',
    'direct-nested-generic-trusted-writer',
    'direct-nested-specialized-writer',
);
compareCases('frame-struct-prepared-vs-safe', 'frame struct prepared specialized vs safe', 'frame-struct-safe-fallback', 'frame-struct-prepared-specialized');
compareCases('frame-nested-prepared-vs-safe', 'frame nested prepared specialized vs safe', 'frame-nested-safe-fallback', 'frame-nested-prepared-specialized');
await writeJsonFile(jsonOut, report);
await writeTextFile(markdownOut, `${renderMarkdown(report)}\n`);

function directWriterCase(id, label, group, codec, value, mode) {
    const prepared = mode === 'safe' ? undefined : requiredPrepared(codec);
    const selection = mode === 'selected' ? selectPreparedMeasuredWriter(prepared, value) : undefined;
    if (mode === 'selected' && selection === undefined) {
        throw new Error(`Expected selected measured writer for benchmark case ${label}`);
    }
    const payloadLength = selection?.payloadLength ?? codec.measure(value);
    const ring = createScratchRing(payloadLength);
    return {
        id,
        label,
        group,
        strategy: mode === 'safe' ? 'safe-writer' : mode === 'generic-trusted' ? 'generic-trusted-measured-writer' : selection.strategyId,
        async run() {
            if (mode === 'safe') {
                const writer = new RingBinaryWriter(ring, 0, payloadLength);
                codec.write(writer, value);
                writer.finish();
                return;
            }
            const writer = unsafeCreateTrustedMeasuredRingBinaryWriter(ring, 0, payloadLength);
            if (mode === 'generic-trusted') {
                prepared.write(writer, value);
            } else if (selection.strategy === undefined) {
                prepared.write(writer, value);
            } else {
                selection.strategy.write(writer, value, selection.payloadLength);
            }
            writer.finish();
        },
    };
}
async function frameCase(id, label, group, codec, value, prepared) {
    const preparedCodec = prepared ? requiredPrepared(codec) : undefined;
    const selectedCodec = prepared ? preparedCodec : wrapUnpreparedBinaryCodec(codec);
    const selected = prepared ? selectPreparedMeasuredWriter(preparedCodec, value) : undefined;
    if (prepared && selected === undefined) {
        throw new Error(`Expected selected measured writer for frame benchmark case ${label}`);
    }
    const capacityBytes = nextPowerOfTwo(Math.max(MIN_CAPACITY_BYTES, codec.measure(value) + 64));
    const { left, right } = createEndpointPair(capacityBytes);
    return {
        id,
        label,
        group,
        strategy: prepared ? selected.strategyId : 'safe-fallback',
        async run(index) {
            await left.send(Opcode.REQUEST, (index + 1) >>> 0, 1, selectedCodec, value);
            const frame = await right.receive();
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
function createEndpointPair(capacityBytes) {
    const aToB = createRingBufferSab(capacityBytes);
    const bToA = createRingBufferSab(capacityBytes);
    const left = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(aToB, capacityBytes), createWaitStrategy(false), 'codec-bench-left->right'),
        inbound: new SharedRingBuffer(createRingLayout(bToA, capacityBytes), createWaitStrategy(false), 'codec-bench-right->left'),
    });
    const right = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(bToA, capacityBytes), createWaitStrategy(false), 'codec-bench-right->left'),
        inbound: new SharedRingBuffer(createRingLayout(aToB, capacityBytes), createWaitStrategy(false), 'codec-bench-left->right'),
    });
    return { left, right };
}
function createScratchRing(payloadLength) {
    const capacityBytes = nextPowerOfTwo(Math.max(MIN_CAPACITY_BYTES, payloadLength, 1));
    const sab = createRingBufferSab(capacityBytes);
    return new SharedRingBuffer(createRingLayout(sab, capacityBytes), createWaitStrategy(false), 'codec-bench-scratch');
}
function patternedBytes(length) {
    return Uint8Array.from({ length }, (_, index) => (index * 31 + 17) & 0xff);
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
        '# Codec writer fast path benchmark',
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
