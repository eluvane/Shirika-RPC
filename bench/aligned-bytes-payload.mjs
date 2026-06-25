import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { renderMarkdownTable, writeJsonFile, writeTextFile } from '../scripts/bench/reporting.mjs';

const CONTROL_INDEX = {
    READ_SEQ: 0,
    WRITE_SEQ: 1,
};
const ALIGNED_BYTES_PAYLOAD_FLAG = 1 << 30;
const DEFAULT_PAYLOAD_SIZES = ['small', '1MiB', '8MiB', '32MiB'];
const argv = process.argv.slice(2);
const beforeDist = readCliOption(argv, '--before-dist');
const afterDist = readCliOption(argv, '--after-dist');
const dist = readCliOption(argv, '--dist') ?? '../dist/index.js';
const jsonOut = readCliOption(argv, '--json-out');
const markdownOut = readCliOption(argv, '--markdown-out');
const iterationsOverride = readPositiveInteger(argv, '--iterations');
const warmupOverride = readPositiveInteger(argv, '--warmup');
const payloadSizes = parsePayloadSizes(readCliOption(argv, '--payload-sizes') ?? DEFAULT_PAYLOAD_SIZES.join(','));

if (beforeDist !== undefined || afterDist !== undefined) {
    if (beforeDist === undefined || afterDist === undefined) {
        throw new Error('Use both --before-dist and --after-dist to compare two builds');
    }
    const before = await runSuite('before', beforeDist);
    const after = await runSuite('after', afterDist);
    printComparison(before, after);
} else {
    const current = await runSuite('current', dist);
    if (jsonOut !== undefined) {
        await writeJsonFile(jsonOut, toBenchmarkReport(current, dist));
    }
    if (markdownOut !== undefined) {
        await writeTextFile(markdownOut, renderBenchmarkReport(toBenchmarkReport(current, dist)));
    }
}

async function runSuite(label, distSpecifier) {
    const rpc = await import(resolveImport(distSpecifier));
    const cases = [];
    console.log(`# aligned-bytes payload benchmark (${label})`);
    console.log(`runtime=${process.version} dist=${distSpecifier} payloadSizes=${payloadSizes.map((entry) => entry.label).join(',')}`);
    for (const payloadSize of payloadSizes) {
        for (const shape of ['no-wrap', 'prefix-wrap', 'body-wrap']) {
            const iterations = iterationsOverride ?? defaultIterations(payloadSize.bytes);
            const warmup = warmupOverride ?? defaultWarmup(payloadSize.bytes);
            const result = await runCase(rpc, payloadSize, shape, warmup, iterations);
            cases.push(result);
            console.log(
                `${result.caseId.padEnd(32)} ops/sec=${formatNumber(result.opsPerSec)} avg=${formatNumber(result.avgMs)}ms p95=${formatNumber(
                    result.p95Ms,
                )}ms iterations=${iterations}`,
            );
        }
    }
    return { label, cases };
}

async function runCase(rpc, payloadSize, shape, warmupIterations, iterations) {
    const {
        codecs,
        createRingBufferSab,
        createRingLayout,
        createWaitStrategy,
        DuplexEndpoint,
        FRAME_MAGIC,
        FRAME_VERSION,
        HEADER_SIZE,
        Opcode,
        SharedRingBuffer,
    } = rpc;
    const body = patternedBytes(payloadSize.bytes);
    const payload = encodeAlignedBytesPayload(body);
    const frameSize = align8(HEADER_SIZE + payload.byteLength);
    const capacityBytes = nextPowerOfTwo(frameSize + 64);
    const readSeq = readSeqForShape(shape, capacityBytes, HEADER_SIZE);
    const header = {
        magic: FRAME_MAGIC,
        version: FRAME_VERSION,
        opcode: Opcode.REQUEST,
        flags: ALIGNED_BYTES_PAYLOAD_FLAG,
        requestId: 1,
        methodId: 1,
        statusCode: 0,
        payloadLength: payload.byteLength,
        reserved: 0,
    };
    const frameBytes = new Uint8Array(frameSize);
    frameBytes.set(encodeFrameHeader(header, HEADER_SIZE));
    frameBytes.set(payload, HEADER_SIZE);
    const inboundSab = createRingBufferSab(capacityBytes);
    const outboundSab = createRingBufferSab(capacityBytes);
    const endpoint = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(outboundSab, capacityBytes), createWaitStrategy(false), 'aligned-bench-out'),
        inbound: new SharedRingBuffer(createRingLayout(inboundSab, capacityBytes), createWaitStrategy(false), 'aligned-bench-in'),
    });
    const codec = codecs.bytes();
    for (let index = 0; index < warmupIterations; index += 1) {
        publishFrame(endpoint.inbound, readSeq, frameBytes, frameSize);
        const frame = await endpoint.receive();
        assertPayloadSample(frame.readWithCodec(codec), body);
    }
    const latencies = [];
    for (let index = 0; index < iterations; index += 1) {
        publishFrame(endpoint.inbound, readSeq, frameBytes, frameSize);
        const startedAt = performance.now();
        const frame = await endpoint.receive();
        const received = frame.readWithCodec(codec);
        latencies.push(performance.now() - startedAt);
        assertPayloadSample(received, body);
    }
    const totalMs = latencies.reduce((sum, value) => sum + value, 0);
    return {
        caseId: `${payloadSize.label}/${shape}`,
        payloadBytes: payloadSize.bytes,
        shape,
        iterations,
        totalMs,
        avgMs: mean(latencies),
        p95Ms: percentile(latencies, 95),
        opsPerSec: totalMs <= 0 ? 0 : iterations / (totalMs / 1000),
    };
}

function publishFrame(ring, readSeq, frameBytes, frameSize) {
    Atomics.store(ring.control, CONTROL_INDEX.READ_SEQ, readSeq | 0);
    Atomics.store(ring.control, CONTROL_INDEX.WRITE_SEQ, readSeq | 0);
    ring.writeBytes(readSeq, frameBytes, 0, frameSize);
    ring.commitWrite((readSeq + frameSize) | 0);
}

function readSeqForShape(shape, capacityBytes, headerSize) {
    switch (shape) {
        case 'no-wrap':
            return 0;
        case 'prefix-wrap':
            return capacityBytes - 2 - headerSize;
        case 'body-wrap':
            return capacityBytes - 2 - headerSize - 8;
        default:
            throw new Error(`Unknown aligned payload benchmark shape ${shape}`);
    }
}

function encodeFrameHeader(header, headerSize) {
    const bytes = new Uint8Array(headerSize);
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

function encodeAlignedBytesPayload(body) {
    const payload = new Uint8Array(8 + body.byteLength);
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    view.setUint32(0, body.byteLength, true);
    view.setUint32(4, 0, true);
    payload.set(body, 8);
    return payload;
}

function patternedBytes(length) {
    return Uint8Array.from({ length }, (_, index) => (index * 31 + 17) & 0xff);
}

function assertPayloadSample(received, expected) {
    if (!(received instanceof Uint8Array) || received.byteLength !== expected.byteLength) {
        throw new Error(`Unexpected payload length ${received?.byteLength}; expected ${expected.byteLength}`);
    }
    if (expected.byteLength === 0) {
        return;
    }
    const sampleIndexes = new Set([0, expected.byteLength - 1, Math.floor(expected.byteLength / 2), Math.floor(expected.byteLength / 3)]);
    for (const index of sampleIndexes) {
        if (received[index] !== expected[index]) {
            throw new Error(`Unexpected payload byte at ${index}: expected ${expected[index]}, received ${received[index]}`);
        }
    }
}

function toBenchmarkReport(suite, distSpecifier) {
    return {
        schemaVersion: 1,
        suite: 'aligned-bytes-payload',
        generatedAt: new Date().toISOString(),
        runtime: { node: process.version, platform: process.platform, arch: process.arch },
        benchmark: { dist: distSpecifier, payloadSizes: payloadSizes.map((entry) => entry.label), iterationsOverride, warmupOverride },
        cases: suite.cases.map((entry) => ({
            id: entry.caseId,
            label: `${entry.caseId}`,
            group: entry.shape,
            metrics: {
                opsPerSec: entry.opsPerSec,
                avgLatencyMs: entry.avgMs,
                p50LatencyMs: entry.avgMs,
                p95LatencyMs: entry.p95Ms,
                p99LatencyMs: entry.p95Ms,
                rmePct: 0,
                totalMs: entry.totalMs,
                payloadBytes: entry.payloadBytes,
            },
        })),
    };
}

function renderBenchmarkReport(data) {
    return `# aligned-bytes payload benchmark\n\nGenerated at: ${data.generatedAt}\nNode: ${data.runtime.node}\n\n${renderMarkdownTable(
        ['Case', 'ops/sec', 'avg ms', 'p95 ms', 'payload bytes'],
        data.cases.map((entry) => [
            entry.label,
            formatNumber(entry.metrics.opsPerSec),
            formatNumber(entry.metrics.avgLatencyMs),
            formatNumber(entry.metrics.p95LatencyMs),
            String(entry.metrics.payloadBytes),
        ]),
    )}\n`;
}

function printComparison(before, after) {
    const afterByCase = new Map(after.cases.map((entry) => [entry.caseId, entry]));
    console.log('# before/after comparison');
    for (const beforeCase of before.cases) {
        const afterCase = afterByCase.get(beforeCase.caseId);
        if (afterCase === undefined) {
            continue;
        }
        const throughputImprovement = ((afterCase.opsPerSec - beforeCase.opsPerSec) / beforeCase.opsPerSec) * 100;
        const avgLatencyReduction = ((beforeCase.avgMs - afterCase.avgMs) / beforeCase.avgMs) * 100;
        const p95LatencyReduction = ((beforeCase.p95Ms - afterCase.p95Ms) / beforeCase.p95Ms) * 100;
        console.log(
            `${beforeCase.caseId.padEnd(32)} throughput=${formatDelta(throughputImprovement)} avgLatency=${formatDelta(
                avgLatencyReduction,
            )} p95Latency=${formatDelta(p95LatencyReduction)}`,
        );
    }
}

function parsePayloadSizes(raw) {
    return raw
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => ({ label: entry, bytes: parseByteSize(entry) }));
}

function parseByteSize(value) {
    if (value === 'small') {
        return 32;
    }
    const match = /^(\d+)(B|KiB|MiB)$/i.exec(value);
    if (!match) {
        throw new Error(`Unsupported payload size ${value}`);
    }
    const number = Number(match[1]);
    const suffix = match[2].toLowerCase();
    return suffix === 'b' ? number : suffix === 'kib' ? number * 1024 : number * 1024 * 1024;
}

function defaultIterations(payloadBytes) {
    if (payloadBytes >= 32 * 1024 * 1024) {
        return 3;
    }
    if (payloadBytes >= 8 * 1024 * 1024) {
        return 8;
    }
    if (payloadBytes >= 1024 * 1024) {
        return 25;
    }
    return 2000;
}

function defaultWarmup(payloadBytes) {
    if (payloadBytes >= 8 * 1024 * 1024) {
        return 1;
    }
    if (payloadBytes >= 1024 * 1024) {
        return 3;
    }
    return 100;
}

function align8(value) {
    return (value + 7) & ~7;
}

function nextPowerOfTwo(value) {
    let result = 1;
    while (result < value) {
        result *= 2;
    }
    return result;
}

function mean(values) {
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, percentileValue) {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.min(sorted.length - 1, Math.floor((percentileValue / 100) * sorted.length))] ?? 0;
}

function resolveImport(value) {
    if (value.startsWith('file:') || value.startsWith('node:') || value.startsWith('data:')) {
        return value;
    }
    if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) {
        return pathToFileURL(value).href;
    }
    return new URL(value, import.meta.url).href;
}

function formatNumber(value) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
}

function formatDelta(value) {
    if (!Number.isFinite(value)) {
        return 'n/a';
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function readCliOption(args, flag) {
    const equalsPrefix = `${flag}=`;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === flag) {
            return args[index + 1];
        }
        if (arg?.startsWith(equalsPrefix)) {
            return arg.slice(equalsPrefix.length);
        }
    }
    return undefined;
}

function readPositiveInteger(args, flag) {
    const raw = readCliOption(args, flag);
    if (raw === undefined) {
        return undefined;
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error(`${flag} must be a positive integer`);
    }
    return value;
}
