import { performance } from 'node:perf_hooks';
import { buildMethodIndex, codecs, describeContract, getContractHash, method, prepareContract } from '../dist/index.js';
import { formatNumber, readCliOption, renderMarkdownTable, writeJsonFile, writeTextFile } from '../scripts/bench/reporting.mjs';

const argv = process.argv.slice(2);
const iterations = readPositiveInteger(argv, '--iterations') ?? 100_000;
const warmupIterations = readPositiveInteger(argv, '--warmup') ?? 10_000;
const methodCount = readPositiveInteger(argv, '--methods') ?? 64;
const jsonOut = readCliOption(argv, '--json-out');
const markdownOut = readCliOption(argv, '--markdown-out');
const contract = createContract(methodCount);
const prepared = prepareContract(contract);
const lastMethodId = methodCount;
const report = {
    schemaVersion: 1,
    suite: 'contract-preparation',
    generatedAt: new Date().toISOString(),
    runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
    },
    benchmark: {
        iterations,
        warmupIterations,
        methodCount,
    },
    cases: [],
    comparisons: [],
};
const cases = [
    {
        id: 'describe-raw-contract',
        label: 'describeContract(raw contract)',
        group: 'description',
        run() {
            assertDescription(describeContract(contract), methodCount);
        },
    },
    {
        id: 'describe-prepared-contract',
        label: 'describeContract(prepared)',
        group: 'description',
        run() {
            assertDescription(describeContract(prepared), methodCount);
        },
    },
    {
        id: 'hash-raw-contract',
        label: 'getContractHash(raw contract)',
        group: 'hash',
        run() {
            assertHash(getContractHash(contract));
        },
    },
    {
        id: 'hash-prepared-contract',
        label: 'getContractHash(prepared)',
        group: 'hash',
        run() {
            assertHash(getContractHash(prepared));
        },
    },
    {
        id: 'build-index-raw-contract',
        label: 'buildMethodIndex(raw contract)',
        group: 'method-index',
        run() {
            assertIndex(buildMethodIndex(contract), lastMethodId);
        },
    },
    {
        id: 'reuse-prepared-method-index',
        label: 'prepared.methodIndex lookup',
        group: 'method-index',
        run() {
            assertPreparedIndex(prepared, lastMethodId);
        },
    },
];
for (const entry of cases) {
    runCase(entry, warmupIterations);
    const measured = runCase(entry, iterations);
    report.cases.push(measured);
    console.log(`${entry.label.padEnd(36)} ops/sec=${formatNumber(measured.metrics.opsPerSec)} total=${formatNumber(measured.metrics.totalMs)}ms`);
}
compareCases('description-prepared-vs-raw', 'describe prepared vs raw', 'describe-raw-contract', 'describe-prepared-contract');
compareCases('hash-prepared-vs-raw', 'hash prepared vs raw', 'hash-raw-contract', 'hash-prepared-contract');
compareCases('method-index-prepared-vs-raw', 'prepared index lookup vs raw build', 'build-index-raw-contract', 'reuse-prepared-method-index');
await writeJsonFile(jsonOut, report);
await writeTextFile(markdownOut, `${renderMarkdown(report)}\n`);

function createContract(count) {
    const entries = {};
    for (let index = count; index >= 1; index -= 1) {
        entries[`method${index.toString().padStart(3, '0')}`] = method(index, codecs.tuple([codecs.u32(), codecs.u32()]), codecs.u32());
    }
    return entries;
}
function runCase(entry, count) {
    const startedAt = performance.now();
    for (let index = 0; index < count; index += 1) {
        entry.run();
    }
    const totalMs = performance.now() - startedAt;
    return {
        id: entry.id,
        label: entry.label,
        group: entry.group,
        metrics: {
            totalMs,
            opsPerSec: totalMs <= 0 ? 0 : count / (totalMs / 1000),
        },
    };
}
function compareCases(id, label, beforeId, afterId) {
    const before = report.cases.find((entry) => entry.id === beforeId);
    const after = report.cases.find((entry) => entry.id === afterId);
    if (!before || !after) {
        throw new Error(`Cannot compare missing benchmark cases ${beforeId} and ${afterId}`);
    }
    const timeReductionPct = ((before.metrics.totalMs - after.metrics.totalMs) / before.metrics.totalMs) * 100;
    const throughputImprovementPct = ((after.metrics.opsPerSec - before.metrics.opsPerSec) / before.metrics.opsPerSec) * 100;
    const comparison = {
        id,
        label,
        before: beforeId,
        after: afterId,
        timeReductionPct,
        throughputImprovementPct,
    };
    report.comparisons.push(comparison);
    console.log(`${label.padEnd(36)} timeReduction=${formatNumber(timeReductionPct)}% throughputImprovement=${formatNumber(throughputImprovementPct)}%`);
}
function assertDescription(description, expectedLength) {
    if (description.length !== expectedLength || description[0]?.id !== 1) {
        throw new Error('Unexpected contract description result');
    }
}
function assertHash(hash) {
    if (!hash.startsWith('fnv1a32:')) {
        throw new Error(`Unexpected contract hash ${hash}`);
    }
}
function assertIndex(index, expectedMethodId) {
    if (index.get(expectedMethodId)?.method !== `method${expectedMethodId.toString().padStart(3, '0')}`) {
        throw new Error('Unexpected method index result');
    }
}
function assertPreparedIndex(preparedContract, expectedMethodId) {
    if (preparedContract.methodIndex.get(expectedMethodId)?.method !== `method${expectedMethodId.toString().padStart(3, '0')}`) {
        throw new Error('Unexpected prepared method index result');
    }
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
        '# Contract preparation benchmark',
        '',
        `Generated at: ${data.generatedAt}`,
        `Node: ${data.runtime.node}`,
        `Methods: ${data.benchmark.methodCount}`,
        `Iterations: ${data.benchmark.iterations}`,
        '',
        renderMarkdownTable(
            ['Case', 'ops/sec', 'total ms'],
            data.cases.map((entry) => [entry.label, formatNumber(entry.metrics.opsPerSec), formatNumber(entry.metrics.totalMs)]),
        ),
        '',
        renderMarkdownTable(
            ['Comparison', 'time reduction %', 'throughput improvement %'],
            data.comparisons.map((entry) => [entry.label, formatNumber(entry.timeReductionPct), formatNumber(entry.throughputImprovementPct)]),
        ),
    ].join('\n');
}
