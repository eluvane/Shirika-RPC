import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const config = path.join(rootDir, '.config', 'shirika', 'lints', 'yamllint.yml');
const moduleArgs = ['-m', 'yamllint', '-c', config, '.'];
const candidates = [
    ['python3', moduleArgs],
    ['python', moduleArgs],
    ['py', ['-3', ...moduleArgs]],
];

function isMissingCommand(result) {
    if (result.error && (result.error.code === 'ENOENT' || result.status === 127)) {
        return true;
    }
    const text = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    return /(?:not found|No module named yamllint|Python was not found|was not found)/i.test(text);
}

let sawRunner = false;
for (const [command, args] of candidates) {
    const result = spawnSync(command, args, {
        cwd: rootDir,
        encoding: 'utf8',
        shell: false,
    });
    if (isMissingCommand(result)) {
        continue;
    }
    sawRunner = true;
    if (result.stdout) {
        process.stdout.write(result.stdout);
    }
    if (result.stderr) {
        process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
}

if (!sawRunner) {
    console.error('yamllint runner: need python3/python/py with the yamllint module installed');
    process.exit(1);
}

process.exit(1);
