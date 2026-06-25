import { performance } from 'node:perf_hooks';
import { PendingRequestStore } from '../dist/core/rpc/pending.js';
import { formatNumber as formatDecimal, readCliOption, renderMarkdownTable, writeJsonFile, writeTextFile } from '../scripts/bench/reporting.mjs';

const argv = process.argv.slice(2);
const iterations = readPositiveIntegerFlag('--iterations', 100_000);
const samples = readPositiveIntegerFlag('--samples', 25);
const warmupSamples = readPositiveIntegerFlag('--warmup-samples', 5);
const jsonOut = readCliOption(argv, '--json-out');
const markdownOut = readCliOption(argv, '--markdown-out');

const benchmarks = [
    {
        id: 'single-request-release',
        name: 'single request release',
        before: runRawSingleLifecycle,
        after: runWitnessSingleLifecycle,
    },
    {
        id: 'late-stale-witness-release',
        name: 'late stale witness release',
        before: runRawLateLifecycle,
        after: runWitnessLateLifecycle,
    },
    {
        id: 'close-many-pending',
        name: 'close many pending',
        before: runRawCloseMany,
        after: runWitnessCloseMany,
    },
];

const report = {
    schemaVersion: 1,
    suite: 'pending-lifecycle',
    generatedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
    benchmark: { iterations, samples, warmupSamples },
    cases: [],
    comparisons: [],
};

console.log(`Pending lifecycle benchmark: iterations=${iterations}, samples=${samples}, warmupSamples=${warmupSamples}`);
console.log('| case | before ops/sec | after ops/sec | throughput Δ | before avg ms/op | after avg ms/op | latency Δ | after p95 ms/op |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|');

for (const benchmark of benchmarks) {
    const before = measure(benchmark.before, iterations, samples, warmupSamples);
    const after = measure(benchmark.after, iterations, samples, warmupSamples);
    const throughputImprovement = ((after.opsPerSecond - before.opsPerSecond) / before.opsPerSecond) * 100;
    const latencyReduction = ((before.avgMsPerOp - after.avgMsPerOp) / before.avgMsPerOp) * 100;
    report.cases.push(toCase(`${benchmark.id}:raw`, `${benchmark.name} raw map`, 'raw', before));
    report.cases.push(toCase(`${benchmark.id}:witness`, `${benchmark.name} witness`, 'witness', after));
    report.comparisons.push({
        id: `${benchmark.id}:witness-vs-raw`,
        label: `${benchmark.name} witness vs raw`,
        baselineCaseId: `${benchmark.id}:raw`,
        candidateCaseId: `${benchmark.id}:witness`,
        delta: { throughputPct: throughputImprovement, latencyPct: -latencyReduction },
    });
    console.log(
        `| ${benchmark.name} | ${formatNumber(before.opsPerSecond)} | ${formatNumber(after.opsPerSecond)} | ${formatPercent(throughputImprovement)} | ${formatMs(
            before.avgMsPerOp,
        )} | ${formatMs(after.avgMsPerOp)} | ${formatPercent(latencyReduction)} | ${formatMs(after.p95MsPerOp)} |`,
    );
}

if (jsonOut !== undefined) {
    await writeJsonFile(jsonOut, report);
}
if (markdownOut !== undefined) {
    await writeTextFile(markdownOut, renderReportMarkdown(report));
}

function toCase(id, label, group, metrics) {
    return {
        id,
        label,
        group,
        metrics: {
            opsPerSec: metrics.opsPerSecond,
            avgLatencyMs: metrics.avgMsPerOp,
            p50LatencyMs: metrics.p50MsPerOp,
            p95LatencyMs: metrics.p95MsPerOp,
            p99LatencyMs: metrics.p99MsPerOp,
            rmePct: 0,
        },
    };
}

function measure(run, operationCount, sampleCount, warmupCount) {
    for (let index = 0; index < warmupCount; index += 1) {
        run(operationCount);
    }
    const sampleMs = [];
    for (let index = 0; index < sampleCount; index += 1) {
        const startedAt = performance.now();
        run(operationCount);
        sampleMs.push(performance.now() - startedAt);
    }
    sampleMs.sort((left, right) => left - right);
    const totalMs = sampleMs.reduce((sum, ms) => sum + ms, 0);
    const avgMs = totalMs / sampleMs.length;
    return {
        opsPerSecond: operationCount / (avgMs / 1000),
        avgMsPerOp: avgMs / operationCount,
        p50MsPerOp: percentile(sampleMs, 0.5) / operationCount,
        p95MsPerOp: percentile(sampleMs, 0.95) / operationCount,
        p99MsPerOp: percentile(sampleMs, 0.99) / operationCount,
    };
}

function runRawSingleLifecycle(operationCount) {
    const pending = new Map();
    let nextRequestId = 1;
    for (let index = 0; index < operationCount; index += 1) {
        const requestId = nextRequestId;
        nextRequestId += 1;
        const entry = { index };
        pending.set(requestId, entry);
        const current = pending.get(requestId);
        if (current !== undefined) {
            pending.delete(requestId);
        }
    }
}

function runWitnessSingleLifecycle(operationCount) {
    const pending = new PendingRequestStore();
    for (let index = 0; index < operationCount; index += 1) {
        const requestId = pending.allocateRequestId();
        const witness = pending.insertAllocated(requestId, { index });
        pending.releaseByWitness(witness);
    }
}

function runRawLateLifecycle(operationCount) {
    const pending = new Map();
    for (let index = 0; index < operationCount; index += 1) {
        const oldEntry = { index };
        pending.set(1, oldEntry);
        pending.delete(1);
        const newEntry = { index: -index };
        pending.set(1, newEntry);
        if (pending.get(1) === oldEntry) {
            pending.delete(1);
        }
        if (pending.get(1) === newEntry) {
            pending.delete(1);
        }
    }
}

function runWitnessLateLifecycle(operationCount) {
    const pending = new PendingRequestStore();
    for (let index = 0; index < operationCount; index += 1) {
        const oldWitness = pending.insertAllocated(1, { index });
        pending.releaseUntrusted(1);
        const newWitness = pending.insertAllocated(1, { index: -index });
        pending.releaseByWitness(oldWitness);
        pending.releaseByWitness(newWitness);
    }
}

function runRawCloseMany(operationCount) {
    const pending = new Map();
    for (let requestId = 1; requestId <= operationCount; requestId += 1) {
        pending.set(requestId, { requestId });
    }
    for (const requestId of Array.from(pending.keys())) {
        const entry = pending.get(requestId);
        if (entry !== undefined) {
            pending.delete(requestId);
        }
    }
}

function runWitnessCloseMany(operationCount) {
    const pending = new PendingRequestStore();
    for (let requestId = 1; requestId <= operationCount; requestId += 1) {
        pending.insertAllocated(requestId, { requestId });
    }
    for (const witness of pending.witnessesSnapshot()) {
        pending.releaseByWitness(witness);
    }
}

function percentile(sortedValues, probability) {
    const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil(sortedValues.length * probability) - 1));
    return sortedValues[index] ?? 0;
}

function readPositiveIntegerFlag(name, fallback) {
    const index = process.argv.indexOf(name);
    if (index < 0) {
        return fallback;
    }
    const rawValue = process.argv[index + 1];
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer, got ${rawValue}`);
    }
    return value;
}

function renderReportMarkdown(data) {
    return `# pending lifecycle benchmark\n\nGenerated at: ${data.generatedAt}\nNode: ${data.runtime.node}\n\n${renderMarkdownTable(
        ['Case', 'ops/sec', 'avg ms/op', 'p95 ms/op', 'p99 ms/op'],
        data.cases.map((entry) => [
            entry.label,
            formatDecimal(entry.metrics.opsPerSec),
            formatDecimal(entry.metrics.avgLatencyMs, 6),
            formatDecimal(entry.metrics.p95LatencyMs, 6),
            formatDecimal(entry.metrics.p99LatencyMs, 6),
        ]),
    )}\n`;
}

function formatNumber(value) {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function formatPercent(value) {
    return `${value.toFixed(1)}%`;
}

function formatMs(value) {
    return value.toFixed(6);
}
