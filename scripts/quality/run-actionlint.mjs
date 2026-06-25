import { spawnSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflowsDir = path.join(rootDir, '.github', 'workflows');
const entries = await readdir(workflowsDir, { withFileTypes: true });
const workflowFiles = entries
    .filter((entry) => entry.isFile() && /\.ya?ml$/.test(entry.name))
    .map((entry) => path.join('.github', 'workflows', entry.name))
    .sort();

if (workflowFiles.length === 0) {
    console.error('Expected at least one workflow file under .github/workflows.');
    process.exit(1);
}

const actionlint = process.platform === 'win32' ? 'actionlint.exe' : 'actionlint';
const result = spawnSync(actionlint, ['-config-file', '.config/shirika/ci/actionlint.yml', ...workflowFiles], {
    cwd: rootDir,
    stdio: 'inherit',
});

if (result.error) {
    console.error(`Unable to run actionlint: ${result.error.message}`);
    process.exit(1);
}

process.exit(result.status ?? 1);
