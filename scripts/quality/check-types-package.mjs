import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const pnpmBin = 'pnpm';
const packDir = await mkdtemp(path.join(tmpdir(), 'shirika-rpc-attw-'));

try {
    if (!run(pnpmBin, ['pack', '--pack-destination', packDir])) {
        process.exitCode = 1;
    } else {
        const packedFiles = await readdir(packDir);
        const tarball = packedFiles.find((entry) => entry.endsWith('.tgz'));
        if (!tarball) {
            console.error(`Expected pnpm pack to create a .tgz in ${packDir}`);
            process.exitCode = 1;
        } else if (!run(pnpmBin, ['dlx', '@arethetypeswrong/cli@0.18.3', '--profile', 'esm-only', path.join(packDir, tarball)])) {
            process.exitCode = 1;
        }
    }
} finally {
    await rm(packDir, { recursive: true, force: true });
}

function run(command, args) {
    const result =
        process.platform === 'win32'
            ? spawnSync(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', toCmdCommand(command, args)], { stdio: 'inherit' })
            : spawnSync(command, args, { stdio: 'inherit' });
    if (result.error) {
        throw result.error;
    }
    return result.status === 0;
}

function toCmdCommand(command, args) {
    return [command, ...args].map(quoteCmdArg).join(' ');
}

function quoteCmdArg(value) {
    if (/^[\w./:@\\-]+$/.test(value)) {
        return value;
    }
    return `"${value.replaceAll('"', String.raw`\"`)}"`;
}
