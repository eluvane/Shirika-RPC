import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const pnpmCmd = 'pnpm';
const nodeCmd = process.execPath;
function run(command, args, cwd) {
    return new Promise((resolve, reject) => {
        const childCommand = createCommand(command, args);
        const child = spawn(childCommand.file, childCommand.args, {
            cwd,
            stdio: 'inherit',
            env: { ...process.env },
        });
        child.once('error', reject);
        child.once('exit', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code ?? 'unknown'}`));
        });
    });
}
function createCommand(command, args) {
    if (process.platform !== 'win32' || command !== pnpmCmd) {
        return { file: command, args };
    }
    return { file: process.env.ComSpec ?? 'cmd.exe', args: ['/d', '/s', '/c', [command, ...args].map(quoteCmdArg).join(' ')] };
}
function quoteCmdArg(value) {
    if (/^[\w./:@\\-]+$/.test(value)) {
        return value;
    }
    return `"${value.replaceAll('"', String.raw`\"`)}"`;
}
const tempRoot = await mkdtemp(path.join(tmpdir(), 'shirika-rpc-pack-'));
try {
    const packDir = path.join(tempRoot, 'pack');
    const appDir = path.join(tempRoot, 'app');
    await mkdir(packDir, { recursive: true });
    await mkdir(appDir, { recursive: true });
    await run(pnpmCmd, ['pack', '--pack-destination', packDir], rootDir);
    const tarball = (await readdir(packDir)).find((entry) => entry.endsWith('.tgz'));
    if (!tarball) {
        throw new Error('pnpm pack did not produce a tarball');
    }
    await writeFile(
        path.join(appDir, 'package.json'),
        JSON.stringify(
            {
                name: 'shirika-rpc-pack-smoke-app',
                private: true,
                type: 'module',
                dependencies: {
                    'shirika-rpc': `file:${path.join(packDir, tarball)}`,
                },
            },
            null,
            2,
        ),
    );
    await writeFile(
        path.join(appDir, 'contract.mjs'),
        [
            "import { codecs, defineContract, method } from 'shirika-rpc';",
            '',
            'export const contract = defineContract({',
            '  ping: method(',
            '    1,',
            '    codecs.struct({ text: codecs.string() }),',
            '    codecs.struct({ text: codecs.string() }),',
            '  ),',
            '  sum: method(',
            '    2,',
            '    codecs.struct({ a: codecs.f64(), b: codecs.f64() }),',
            '    codecs.struct({ value: codecs.f64() }),',
            '  ),',
            '});',
            '',
        ].join('\n'),
    );
    await writeFile(
        path.join(appDir, 'worker.mjs'),
        [
            "import { runNodeWorkerRpcServer } from 'shirika-rpc/worker-node';",
            "import { contract } from './contract.mjs';",
            '',
            'await runNodeWorkerRpcServer({',
            '  contract,',
            '  handlers: {',
            '    ping(request) {',
            '      return { text: request.text };',
            '    },',
            '    sum(request) {',
            '      return { value: request.a + request.b };',
            '    },',
            '  },',
            '});',
            '',
        ].join('\n'),
    );
    await writeFile(
        path.join(appDir, 'index.mjs'),
        [
            "import { Worker } from 'node:worker_threads';",
            "import { createNodeWorkerRpcClient } from 'shirika-rpc/node';",
            "import { getContractHash } from 'shirika-rpc';",
            "import { contract } from './contract.mjs';",
            '',
            "const browserEntry = await import('shirika-rpc/browser');",
            "const workerEntry = await import('shirika-rpc/worker-node');",
            "if (typeof browserEntry.createBrowserWorkerRpcClient !== 'function') throw new Error('browser subpath export missing');",
            "if (typeof workerEntry.runNodeWorkerRpcServer !== 'function') throw new Error('worker-node subpath export missing');",
            '',
            'const hash = getContractHash(contract);',
            "if (typeof hash !== 'string' || !hash.startsWith('fnv1a32:')) throw new Error('unexpected contract hash');",
            '',
            "const worker = new Worker(new URL('./worker.mjs', import.meta.url));",
            'let client;',
            'try {',
            '  client = await createNodeWorkerRpcClient(worker, contract);',
            "  const ping = await client.call('ping', { text: 'pack-smoke' });",
            "  if (ping.text !== 'pack-smoke') throw new Error('unexpected ping response');",
            "  const sum = await client.call('sum', { a: 20, b: 22 });",
            "  if (sum.value !== 42) throw new Error('unexpected sum response');",
            "  console.log('pack smoke ok');",
            '} finally {',
            '  await client?.close().catch(() => {});',
            '  await worker.terminate().catch(() => {});',
            '}',
            '',
        ].join('\n'),
    );
    await run(pnpmCmd, ['install', '--ignore-scripts', '--strict-peer-dependencies'], appDir);
    await run(nodeCmd, ['index.mjs'], appDir);
} finally {
    await rm(tempRoot, { recursive: true, force: true });
}
