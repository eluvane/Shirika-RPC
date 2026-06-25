import { performance } from 'node:perf_hooks';
import { Worker } from 'node:worker_threads';
import { Bench } from 'tinybench';
import { createNodeWorkerPool } from '../dist/node.js';
import { formatNumber, mean, percentile, readCliOption, renderMarkdownTable, writeJsonFile, writeTextFile } from '../scripts/bench/reporting.mjs';
import { exampleContract } from '../shared/contract.mjs';

const argv = process.argv.slice(2);
const jsonOut = readCliOption(argv, '--json-out');
const markdownOut = readCliOption(argv, '--markdown-out');
const workerCounts = [1, 2, 4];
const concurrencies = [1, 8, 32];
const report = {
    schemaVersion: 1,
    suite: 'node-pool-contention',
    generatedAt: new Date().toISOString(),
    runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
    },
    cases: [],
};
for (const workerCount of workerCounts) {
    const pool = await createNodeWorkerPool(() => new Worker(new URL('./workers/sab-worker.mjs', import.meta.url), { type: 'module' }), exampleContract, {
        size: workerCount,
    });
    for (const concurrency of concurrencies) {
        await warmup(async () => {
            await runBurst(pool, concurrency);
        });
        const taskName = `${workerCount} workers @ c=${concurrency}`;
        const latencies = [];
        const bench = new Bench({ time: 500, iterations: 25 });
        bench.add(taskName, async () => {
            const start = performance.now();
            await runBurst(pool, concurrency);
            latencies.push(performance.now() - start);
        });
        await bench.run();
        const task = bench.tasks[0];
        const metrics = {
            opsPerSec: task.result?.state === 'completed' ? task.result.throughput.mean : 0,
            avgLatencyMs: mean(latencies),
            p50LatencyMs: percentile(latencies, 50),
            p95LatencyMs: percentile(latencies, 95),
            p99LatencyMs: percentile(latencies, 99),
            rmePct: task.result?.state === 'completed' ? task.result.throughput.rme : 0,
        };
        report.cases.push({
            id: taskName,
            label: taskName,
            workerCount,
            concurrency,
            group: `${workerCount} workers`,
            metrics,
        });
        console.log(
            [
                taskName.padEnd(24),
                `ops/sec=${formatNumber(metrics.opsPerSec)}`,
                `avg=${formatNumber(metrics.avgLatencyMs)}ms`,
                `p50=${formatNumber(metrics.p50LatencyMs)}ms`,
                `p95=${formatNumber(metrics.p95LatencyMs)}ms`,
                `p99=${formatNumber(metrics.p99LatencyMs)}ms`,
                `rme=${formatNumber(metrics.rmePct)}%`,
            ].join(' | '),
        );
    }
    await pool.close();
    console.log('');
}
await writeJsonFile(jsonOut, report);
await writeTextFile(markdownOut, `${renderMarkdown(report)}\n`);
async function runBurst(pool, concurrency) {
    await Promise.all(Array.from({ length: concurrency }, (_, index) => pool.call('sum', { a: index, b: index + 1 })));
}
async function warmup(fn, iterations = 8) {
    for (let index = 0; index < iterations; index += 1) {
        await fn();
    }
}
function renderMarkdown(currentReport) {
    const lines = ['# node-pool-contention', ''];
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
