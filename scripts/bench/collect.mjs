import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatNumber, readCliOption, renderMarkdownTable, writeJsonFile, writeTextFile } from './reporting.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const nodeCmd = process.platform === 'win32' ? 'node.exe' : 'node';
const argv = process.argv.slice(2);
const smoke = argv.includes('--smoke');
const outDir = path.resolve(rootDir, readCliOption(argv, '--out-dir') ?? (smoke ? '.benchmark/smoke' : '.benchmark/current'));
await mkdir(outDir, { recursive: true });

const matrix = [
    suite('contract-preparation', 'bench/contract-preparation.mjs', smoke ? ['--iterations', '5000'] : []),
    suite('frame-receive', 'bench/frame-receive.mjs', smoke ? ['--iterations', '1000', '--warmup', '100'] : []),
    suite('aligned-bytes-payload', 'bench/aligned-bytes-payload.mjs', smoke ? ['--payload-sizes', 'small,1MiB', '--iterations', '3', '--warmup', '1'] : []),
    suite('codec-writer-fast-path', 'bench/codec-writer-fast-path.mjs', smoke ? ['--iterations', '3000', '--warmup', '300', '--samples', '5'] : []),
    suite('codec-read-fast-path', 'bench/codec-read-fast-path.mjs', smoke ? ['--iterations', '3000', '--warmup', '300', '--samples', '5'] : [], {
        SHIRIKA_RPC_ENABLE_READ_SIDE_ENCODED_PAYLOAD: '1',
    }),
    suite('pending-lifecycle', 'bench/pending-lifecycle.mjs', smoke ? ['--iterations', '10000', '--samples', '5', '--warmup-samples', '1'] : []),
    suite('node-postmessage-vs-sab', 'bench/node-postmessage-vs-sab.mjs', smoke ? ['--payload-sizes', '32,64KiB', '--iterations', '10'] : []),
    suite('node-pool-contention', 'bench/node-pool-contention.mjs', []),
];

for (const entry of matrix) {
    await runSuite(entry);
}

const suiteMetadata = await readSuiteMetadata();
const baseline = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: smoke ? 'smoke' : 'full',
    runtime: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
    },
    benchmarkSuites: suiteMetadata.suites ?? [],
    fastPathStrategy: {
        mode: process.env.SHIRIKA_RPC_FAST_PATH_MODE ?? 'default',
        disableAll: process.env.SHIRIKA_RPC_DISABLE_FAST_PATHS ?? '0',
        readSideOptIn: process.env.SHIRIKA_RPC_ENABLE_READ_SIDE_ENCODED_PAYLOAD ?? 'collect-matrix',
    },
    suites: await Promise.all(matrix.map(async (entry) => JSON.parse(await readFile(entry.jsonPath, 'utf8')))),
};

const summaryLines = [
    '# Benchmark baseline',
    '',
    `Generated at: ${baseline.generatedAt}`,
    `Mode: ${baseline.mode}`,
    `Node: ${baseline.runtime.node}`,
    `Platform: ${baseline.runtime.platform}/${baseline.runtime.arch}`,
    '',
];
for (const report of baseline.suites) {
    summaryLines.push(`## ${report.suite}`);
    summaryLines.push('');
    summaryLines.push(
        renderMarkdownTable(
            ['Case', 'ops/sec', 'avg ms', 'p50 ms', 'p95 ms', 'p99 ms', 'rme %'],
            report.cases.map((entry) => [
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
    summaryLines.push('');
}
await writeJsonFile(path.join(outDir, 'baseline.json'), baseline);
await writeTextFile(path.join(outDir, 'summary.md'), `${summaryLines.join('\n')}\n`);

function suite(name, scriptPath, args = [], env = {}) {
    const jsonPath = path.join(outDir, `${name}.json`);
    const markdownPath = path.join(outDir, `${name}.md`);
    return {
        name,
        scriptPath,
        jsonPath,
        markdownPath,
        args: [...args, '--json-out', jsonPath, '--markdown-out', markdownPath],
        env,
    };
}

async function runSuite(entry) {
    await new Promise((resolve, reject) => {
        const child = spawn(nodeCmd, [entry.scriptPath, ...entry.args], {
            cwd: rootDir,
            stdio: 'inherit',
            env: { ...process.env, ...entry.env },
        });
        child.once('error', reject);
        child.once('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${entry.scriptPath} failed with exit code ${code ?? 'unknown'}`));
        });
    });
}

async function readSuiteMetadata() {
    try {
        return JSON.parse(await readFile(path.join(rootDir, '.benchmark', 'suites.json'), 'utf8'));
    } catch {
        return {};
    }
}
