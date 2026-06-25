import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonWithComments } from './lib-checks.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const manifestPath = '.config/shirika/quality/lint-manifest.json';
const manifest = parseJsonWithComments(await readFile(path.join(rootDir, manifestPath), 'utf8'), manifestPath);
const mode = process.argv[2] ?? 'required';
const selected = resolveScripts(mode);
let failed = false;

if (selected.length === 0) {
    console.error(`Unknown lint mode or empty script set: ${mode}`);
    process.exit(1);
}

for (const script of selected) {
    console.log(`\n▶ ${script}`);
    const command = createPnpmRunCommand(script);
    const result = spawnSync(command.file, command.args, {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: 'inherit',
    });
    if (result.error) {
        console.error(`Unable to run ${script}: ${result.error.message}`);
        failed = true;
        continue;
    }
    if (result.status !== 0) {
        failed = true;
    }
}

if (failed) {
    process.exitCode = 1;
}

function resolveScripts(requestedMode) {
    if (requestedMode in manifest) {
        return manifest[requestedMode];
    }
    if (requestedMode === 'all') {
        return [...manifest.required, ...manifest.strict, ...manifest.paranoid];
    }
    if (requestedMode === 'ci') {
        return [...manifest.required, ...manifest.strict];
    }
    if (requestedMode === 'non-network') {
        return [...manifest.required];
    }
    return [];
}

function createPnpmRunCommand(script) {
    const args = ['run', '-s', script];
    if (process.platform !== 'win32') {
        return { file: 'pnpm', args };
    }
    return { file: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', ['pnpm', ...args].map(quoteCmdArg).join(' ')] };
}

function quoteCmdArg(value) {
    if (/^[\w./:@\\-]+$/.test(value)) {
        return value;
    }
    return `"${value.replaceAll('"', String.raw`\"`)}"`;
}
