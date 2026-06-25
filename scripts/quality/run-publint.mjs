import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);
const packDir = await mkdtemp(path.join(tmpdir(), 'shirika-rpc-publint-'));

try {
    if (!runPnpm(['pack', '--pack-destination', packDir])) {
        process.exitCode = 1;
    } else {
        const packedFiles = await readdir(packDir);
        const tarball = packedFiles.find((entry) => entry.endsWith('.tgz'));
        if (!tarball) {
            console.error(`Expected pnpm pack to create a .tgz in ${packDir}`);
            process.exitCode = 1;
        } else {
            const publintCli = path.join(path.dirname(require.resolve('publint')), 'cli.js');
            const result = spawnSync(process.execPath, [publintCli, 'run', path.join(packDir, tarball), '--pack', 'false'], {
                cwd: rootDir,
                stdio: 'inherit',
            });
            if (result.error) {
                throw result.error;
            }
            process.exitCode = result.status ?? 1;
        }
    }
} finally {
    await rm(packDir, { recursive: true, force: true });
}

function runPnpm(args) {
    const result =
        process.platform === 'win32'
            ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', ['pnpm', ...args].map(quoteCmdArg).join(' ')], { cwd: rootDir, stdio: 'inherit' })
            : spawnSync('pnpm', args, { cwd: rootDir, stdio: 'inherit' });
    if (result.error) {
        throw result.error;
    }
    return result.status === 0;
}

function quoteCmdArg(value) {
    if (/^[\w./:@\\-]+$/.test(value)) {
        return value;
    }
    return `"${value.replaceAll('"', String.raw`\"`)}"`;
}
