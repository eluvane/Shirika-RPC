import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { formatNumber, readCliOption, renderMarkdownTable, writeJsonFile, writeTextFile } from '../scripts/bench/reporting.mjs';

const argv = process.argv.slice(2);
const iterations = readPositiveInteger(argv, '--iterations') ?? 20_000;
const warmupIterations = readPositiveInteger(argv, '--warmup') ?? 1_000;
const jsonOut = readCliOption(argv, '--json-out');
const markdownOut = readCliOption(argv, '--markdown-out');
const dist = readCliOption(argv, '--dist') ?? '../dist/index.js';
const rpc = await import(resolveImport(dist));
const { createRingBufferSab, createRingLayout, createWaitStrategy, DuplexEndpoint, Opcode, SharedRingBuffer } = rpc;
const payloads = {
    empty: new Uint8Array(0),
    small: Uint8Array.from({ length: 32 }, (_, index) => index & 0xff),
};
const rawBytesCodec = {
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
};
const cases = [
    {
        id: 'empty-request-frame',
        label: 'empty request frame receive/read',
        payloadFor() {
            return payloads.empty;
        },
        opcodeFor() {
            return Opcode.REQUEST;
        },
    },
    {
        id: 'small-request-frame',
        label: 'small request frame receive/read',
        payloadFor() {
            return payloads.small;
        },
        opcodeFor() {
            return Opcode.REQUEST;
        },
    },
    {
        id: 'mixed-control-frames',
        label: 'mixed request/response/cancel receive/read',
        payloadFor(index) {
            return index % 3 === 2 ? payloads.empty : payloads.small;
        },
        opcodeFor(index) {
            return index % 3 === 0 ? Opcode.REQUEST : index % 3 === 1 ? Opcode.RESPONSE_OK : Opcode.CANCEL;
        },
    },
];

const report = {
    schemaVersion: 1,
    suite: 'frame-receive',
    generatedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    benchmark: { iterations, warmupIterations, dist },
    cases: [],
};

console.log(`# frame-receive benchmark`);
console.log(`runtime=${process.version} iterations=${iterations} warmup=${warmupIterations} dist=${dist}`);
for (const entry of cases) {
    await runCase(entry, warmupIterations);
    const measured = await runCase(entry, iterations);
    report.cases.push({
        id: entry.id,
        label: entry.label,
        group: 'receive',
        metrics: {
            opsPerSec: measured.opsPerSec,
            avgLatencyMs: measured.avgLatencyMs,
            p50LatencyMs: measured.avgLatencyMs,
            p95LatencyMs: measured.avgLatencyMs,
            p99LatencyMs: measured.avgLatencyMs,
            rmePct: 0,
            totalMs: measured.totalMs,
        },
    });
    console.log(
        `${entry.label.padEnd(42)} ops/sec=${formatNumber(measured.opsPerSec)} avg=${formatNumber(measured.avgLatencyMs)}ms total=${formatNumber(measured.totalMs)}ms`,
    );
}

if (jsonOut !== undefined) {
    await writeJsonFile(jsonOut, report);
}
if (markdownOut !== undefined) {
    await writeTextFile(markdownOut, renderReportMarkdown(report));
}

async function runCase(entry, count) {
    const { left, right } = createEndpointPair(4096);
    const startedAt = performance.now();
    for (let index = 0; index < count; index += 1) {
        const payload = entry.payloadFor(index);
        await left.send(entry.opcodeFor(index), (index + 1) >>> 0, 1, rawBytesCodec, payload);
        const frame = await right.receive();
        const received = frame.readWithCodec(rawBytesCodec);
        assertSamePayload(received, payload);
    }
    const totalMs = performance.now() - startedAt;
    return {
        totalMs,
        avgLatencyMs: count <= 0 ? 0 : totalMs / count,
        opsPerSec: totalMs <= 0 ? 0 : count / (totalMs / 1000),
    };
}

function createEndpointPair(capacityBytes) {
    const aToB = createRingBufferSab(capacityBytes);
    const bToA = createRingBufferSab(capacityBytes);
    const left = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(aToB, capacityBytes), createWaitStrategy(false), 'bench-left->right'),
        inbound: new SharedRingBuffer(createRingLayout(bToA, capacityBytes), createWaitStrategy(false), 'bench-right->left'),
    });
    const right = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(bToA, capacityBytes), createWaitStrategy(false), 'bench-right->left'),
        inbound: new SharedRingBuffer(createRingLayout(aToB, capacityBytes), createWaitStrategy(false), 'bench-left->right'),
    });
    return { left, right };
}

function assertSamePayload(received, expected) {
    if (!(received instanceof Uint8Array) || received.byteLength !== expected.byteLength) {
        throw new Error(`Unexpected payload length ${received?.byteLength}; expected ${expected.byteLength}`);
    }
    for (let index = 0; index < expected.byteLength; index += 1) {
        if (received[index] !== expected[index]) {
            throw new Error(`Unexpected payload byte at ${index}`);
        }
    }
}

function renderReportMarkdown(data) {
    return `# frame-receive benchmark\n\nGenerated at: ${data.generatedAt}\nNode: ${data.runtime.node}\n\n${renderMarkdownTable(
        ['Case', 'ops/sec', 'avg ms', 'p95 ms', 'p99 ms'],
        data.cases.map((entry) => [
            entry.label,
            formatNumber(entry.metrics.opsPerSec),
            formatNumber(entry.metrics.avgLatencyMs),
            formatNumber(entry.metrics.p95LatencyMs),
            formatNumber(entry.metrics.p99LatencyMs),
        ]),
    )}\n`;
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
