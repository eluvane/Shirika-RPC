import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';
import { DEFAULT_CAPACITY_BYTES, HEADER_SIZE, MAX_CAPACITY_BYTES } from '../dist/index.js';
import { createNodeWorkerRpcClient } from '../dist/node.js';
import { formatBytes, formatNumber, mean, percentile, readCliOption, renderMarkdownTable, writeJsonFile, writeTextFile } from '../scripts/bench/reporting.mjs';
import { exampleContract } from '../shared/contract.mjs';

const argv = process.argv.slice(2);
const jsonOut = readCliOption(argv, '--json-out');
const markdownOut = readCliOption(argv, '--markdown-out');
const payloadSizes = readPayloadSizes(argv, '--payload-sizes') ?? [32, 4 * 1024, 64 * 1024];
const benchTimeMs = readPositiveInteger(argv, '--time') ?? 500;
const benchIterations = readPositiveInteger(argv, '--iterations') ?? 50;
const warmupIterations = readPositiveInteger(argv, '--warmup') ?? 16;
const includeTransfer = argv.includes('--include-transfer');
const { Bench, runnerName } = await loadBenchImplementation(benchIterations);
const report = {
    schemaVersion: 1,
    suite: 'node-postmessage-vs-sab',
    generatedAt: new Date().toISOString(),
    runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
    },
    benchmark: {
        runner: runnerName,
        timeMs: benchTimeMs,
        iterations: benchIterations,
        warmupIterations,
    },
    cases: [],
};
for (const payloadSize of payloadSizes) {
    const baselineWorker = new Worker(new URL('./workers/postmessage-worker.mjs', import.meta.url), { type: 'module' });
    const transferWorker = includeTransfer ? new Worker(new URL('./workers/postmessage-worker.mjs', import.meta.url), { type: 'module' }) : undefined;
    const sabWorker = new Worker(new URL('./workers/sab-worker.mjs', import.meta.url), { type: 'module' });
    const capacityBytes = capacityForPayload(payloadSize);
    const sabClient = await createNodeWorkerRpcClient(sabWorker, exampleContract, { capacityBytes });
    const baselineRoundTrip = createPostMessageRoundTrip(baselineWorker);
    const transferRoundTrip = transferWorker === undefined ? undefined : createPostMessageRoundTrip(transferWorker, true);
    const binaryPayload = new Uint8Array(payloadSize).fill(1);
    let transferPayload = includeTransfer ? new Uint8Array(payloadSize).fill(1) : undefined;
    const msgpackPayload = { kind: 'blob', payload: binaryPayload };
    const latencyMap = new Map();
    await warmup(async () => {
        assertBytes(await baselineRoundTrip(binaryPayload), payloadSize);
    }, warmupIterations);
    if (transferRoundTrip !== undefined && transferPayload !== undefined) {
        await warmup(async () => {
            transferPayload = assertBytes(await transferRoundTrip(transferPayload), payloadSize);
        }, warmupIterations);
    }
    await warmup(async () => {
        assertBytes(await sabClient.call('echoBytes', binaryPayload), payloadSize);
    }, warmupIterations);
    await warmup(async () => {
        assertMsgpackEcho(await sabClient.call('dynamic', msgpackPayload), payloadSize);
    }, warmupIterations);
    const bench = new Bench({
        time: benchTimeMs,
        iterations: benchIterations,
    });
    maybeRunGc();
    bench.add(`postMessage ${formatBytes(payloadSize)}`, async () => {
        const start = performance.now();
        assertBytes(await baselineRoundTrip(binaryPayload), payloadSize);
        pushLatency(latencyMap, `postMessage ${formatBytes(payloadSize)}`, performance.now() - start);
    });
    if (transferRoundTrip !== undefined && transferPayload !== undefined) {
        bench.add(`postMessage-transfer ${formatBytes(payloadSize)}`, async () => {
            const start = performance.now();
            transferPayload = assertBytes(await transferRoundTrip(transferPayload), payloadSize);
            pushLatency(latencyMap, `postMessage-transfer ${formatBytes(payloadSize)}`, performance.now() - start);
        });
    }
    bench
        .add(`sab-binary ${formatBytes(payloadSize)}`, async () => {
            const start = performance.now();
            assertBytes(await sabClient.call('echoBytes', binaryPayload), payloadSize);
            pushLatency(latencyMap, `sab-binary ${formatBytes(payloadSize)}`, performance.now() - start);
        })
        .add(`sab-msgpack ${formatBytes(payloadSize)}`, async () => {
            const start = performance.now();
            assertMsgpackEcho(await sabClient.call('dynamic', msgpackPayload), payloadSize);
            pushLatency(latencyMap, `sab-msgpack ${formatBytes(payloadSize)}`, performance.now() - start);
        });
    await bench.run();
    console.log(`\n# Payload ${formatBytes(payloadSize)}`);
    for (const task of bench.tasks) {
        const latencies = latencyMap.get(task.name) ?? [];
        const metrics = {
            opsPerSec: task.result?.state === 'completed' ? task.result.throughput.mean : 0,
            avgLatencyMs: mean(latencies),
            p50LatencyMs: percentile(latencies, 50),
            p95LatencyMs: percentile(latencies, 95),
            p99LatencyMs: percentile(latencies, 99),
            rmePct: task.result?.state === 'completed' ? task.result.throughput.rme : 0,
        };
        report.cases.push({
            id: task.name,
            label: task.name,
            group: `Payload ${formatBytes(payloadSize)}`,
            payloadBytes: payloadSize,
            capacityBytes,
            metrics,
        });
        console.log(
            [
                task.name.padEnd(24),
                `ops/sec=${formatNumber(metrics.opsPerSec)}`,
                `avg=${formatNumber(metrics.avgLatencyMs)}ms`,
                `p50=${formatNumber(metrics.p50LatencyMs)}ms`,
                `p95=${formatNumber(metrics.p95LatencyMs)}ms`,
                `p99=${formatNumber(metrics.p99LatencyMs)}ms`,
                `rme=${formatNumber(metrics.rmePct)}%`,
            ].join(' | '),
        );
    }
    await sabClient.close();
    await Promise.allSettled([baselineWorker.terminate(), transferWorker?.terminate(), sabWorker.terminate()]);
}
await writeJsonFile(jsonOut, report);
await writeTextFile(markdownOut, `${renderMarkdown(report)}\n`);
async function loadBenchImplementation(iterations) {
    try {
        const tinybench = await import('tinybench');
        return { Bench: tinybench.Bench, runnerName: 'tinybench' };
    } catch {
        return { Bench: createFixedIterationBench(iterations), runnerName: 'fixed-iteration-fallback' };
    }
}
function createFixedIterationBench(iterations) {
    return class FixedIterationBench {
        tasks = [];
        constructor(options) {
            this.options = options;
        }
        add(name, fn) {
            this.tasks.push({ name, fn, result: undefined });
            return this;
        }
        async run() {
            for (const task of this.tasks) {
                maybeRunGc();
                const startedAt = performance.now();
                for (let index = 0; index < iterations; index += 1) {
                    await task.fn();
                }
                const elapsedMs = performance.now() - startedAt;
                task.result = {
                    state: 'completed',
                    throughput: {
                        mean: elapsedMs <= 0 ? 0 : iterations / (elapsedMs / 1000),
                        rme: 0,
                    },
                };
            }
        }
    };
}
function createPostMessageRoundTrip(worker, transfer = false) {
    let nextId = 1;
    const pending = new Map();
    worker.on('message', (message) => {
        const resolve = pending.get(message.id);
        if (!resolve) {
            return;
        }
        pending.delete(message.id);
        resolve(message.payload);
    });
    return (payload) =>
        new Promise((resolve) => {
            const id = nextId++;
            pending.set(id, resolve);
            const transferList = transfer && payload.buffer instanceof ArrayBuffer ? [payload.buffer] : [];
            worker.postMessage({ type: transfer ? 'echo-transfer' : 'echo', id, payload }, transferList);
        });
}
function maybeRunGc() {
    if (typeof globalThis.gc === 'function') {
        globalThis.gc();
    }
}
async function warmup(fn, iterations = 16) {
    for (let index = 0; index < iterations; index += 1) {
        await fn();
    }
}
function assertBytes(value, expectedLength) {
    if (!(value instanceof Uint8Array)) {
        throw new TypeError(`Expected Uint8Array response, received ${Object.prototype.toString.call(value)}`);
    }
    if (value.byteLength !== expectedLength) {
        throw new TypeError(`Expected ${expectedLength} response bytes, received ${value.byteLength}`);
    }
    if (expectedLength > 0 && (value[0] !== 1 || value[expectedLength - 1] !== 1)) {
        throw new TypeError('Response payload content check failed');
    }
    return value;
}
function assertMsgpackEcho(value, expectedLength) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || value.kind !== 'blob') {
        throw new TypeError('Expected msgpack echo object with kind="blob"');
    }
    assertBytes(value.payload, expectedLength);
}
function pushLatency(map, name, latency) {
    if (!map.has(name)) {
        map.set(name, []);
    }
    map.get(name).push(latency);
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
function readPayloadSizes(args, flag) {
    const rawValue = readCliOption(args, flag);
    if (rawValue === undefined) {
        return undefined;
    }
    return rawValue.split(',').map((value) => parseByteSize(value.trim()));
}
function parseByteSize(value) {
    const match = /^(\d+)(B|KiB|MiB|GiB)?$/iu.exec(value);
    if (!match) {
        throw new TypeError(`Invalid byte size '${value}'. Use values like 65536, 64KiB, 8MiB.`);
    }
    const amount = Number(match[1]);
    const unit = (match[2] ?? 'B').toLowerCase();
    const multiplier = unit === 'gib' ? 1024 * 1024 * 1024 : unit === 'mib' ? 1024 * 1024 : unit === 'kib' ? 1024 : 1;
    const bytes = amount * multiplier;
    if (!Number.isSafeInteger(bytes) || bytes <= 0) {
        throw new TypeError(`Invalid byte size '${value}'`);
    }
    return bytes;
}
function capacityForPayload(payloadSize) {
    const minimum = Math.max(DEFAULT_CAPACITY_BYTES, payloadSize + HEADER_SIZE + 1024);
    const capacityBytes = nextPowerOfTwo(minimum);
    if (capacityBytes > MAX_CAPACITY_BYTES) {
        throw new RangeError(
            `Payload ${formatBytes(payloadSize)} requires ring capacity ${formatBytes(capacityBytes)}, above max ${formatBytes(MAX_CAPACITY_BYTES)}`,
        );
    }
    return capacityBytes;
}
function nextPowerOfTwo(value) {
    return 2 ** Math.ceil(Math.log2(value));
}
function renderMarkdown(currentReport) {
    const lines = ['# node-postmessage-vs-sab', ''];
    const groups = new Map();
    for (const entry of currentReport.cases) {
        if (!groups.has(entry.group)) {
            groups.set(entry.group, []);
        }
        groups.get(entry.group).push(entry);
    }
    for (const [group, entries] of groups) {
        lines.push(`## ${group}`);
        lines.push('');
        lines.push(
            renderMarkdownTable(
                ['Case', 'ops/sec', 'avg ms', 'p50 ms', 'p95 ms', 'p99 ms', 'rme %'],
                entries.map((entry) => [
                    entry.label,
                    formatNumber(entry.metrics.opsPerSec),
                    formatNumber(entry.metrics.avgLatencyMs),
                    formatNumber(entry.metrics.p50LatencyMs),
                    formatNumber(entry.metrics.p95LatencyMs),
                    formatNumber(entry.metrics.p99LatencyMs),
                    formatNumber(entry.metrics.rmePct),
                ]),
            ),
        );
        lines.push('');
    }
    return lines.join('\n');
}
