import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const workflowsDir = path.join(rootDir, '.github', 'workflows');
const errors = [];

function fail(file, message) {
    const relative = path.relative(rootDir, file).split(path.sep).join('/');
    errors.push(`${relative}: ${message}`);
}

function hasTopLevelKey(text, key) {
    return new RegExp(`^${key}:`, 'm').test(text);
}

function checkUsesPinned(file, text) {
    for (const match of text.matchAll(/^\s*uses:\s*([^\s#]+).*$/gm)) {
        const value = match[1];
        if (value.startsWith('docker://')) {
            continue;
        }
        if (!value.includes('@')) {
            fail(file, `action reference must be pinned with @version: ${value}`);
            continue;
        }
        const ref = value.slice(value.lastIndexOf('@') + 1);
        if (['main', 'master', 'latest', 'HEAD'].includes(ref)) {
            fail(file, `action reference must not use a moving ref: ${value}`);
        }
    }
}

function checkInstallPolicy(file, text) {
    for (const match of text.matchAll(/^\s*run:\s*(.+)$/gm)) {
        const command = match[1].trim();
        if (/\bpnpm install\b/.test(command) && (!command.includes('--ignore-scripts') || !command.includes('--strict-peer-dependencies'))) {
            fail(file, `pnpm install must include --ignore-scripts and --strict-peer-dependencies: ${command}`);
        }
        if (/\bnpm install\b|\byarn install\b/.test(command)) {
            fail(file, `use pnpm instead of npm/yarn install: ${command}`);
        }
    }
}

function checkMultilineShellPolicy(file, lines) {
    for (const [index, line] of lines.entries()) {
        if (!/^\s*run:\s*[|>]\s*$/.test(line)) {
            continue;
        }
        const baseIndent = line.match(/^\s*/)?.[0].length ?? 0;
        const body = [];
        for (let next = index + 1; next < lines.length; next += 1) {
            const candidate = lines[next];
            if (candidate.trim() === '') {
                continue;
            }
            const indent = candidate.match(/^\s*/)?.[0].length ?? 0;
            if (indent <= baseIndent) {
                break;
            }
            body.push(candidate.trim());
        }
        if (body.length > 0 && body[0] !== 'set -euo pipefail') {
            fail(file, `multi-line run block at line ${index + 1} must start with set -euo pipefail`);
        }
    }
}

function checkWorkflow(file, text) {
    const lines = text.split('\n');
    if (!hasTopLevelKey(text, 'permissions')) {
        fail(file, 'workflow must declare top-level permissions');
    }
    if (/^\s*pull_request_target:/m.test(text)) {
        fail(file, 'pull_request_target is forbidden for this repository');
    }
    if (/runs-on:\s*ubuntu-latest\b/.test(text)) {
        fail(file, 'use a pinned runner image such as ubuntu-24.04 instead of ubuntu-latest');
    }
    if (/\bcurl\b.*\|\s*(?:ba)?sh\b|\bwget\b.*\|\s*(?:ba)?sh\b/.test(text)) {
        fail(file, 'remote shell-pipe install patterns are forbidden');
    }
    checkUsesPinned(file, text);
    checkInstallPolicy(file, text);
    checkMultilineShellPolicy(file, lines);
}

const entries = await readdir(workflowsDir, { withFileTypes: true });
for (const entry of entries) {
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) {
        continue;
    }
    const file = path.join(workflowsDir, entry.name);
    checkWorkflow(file, await readFile(file, 'utf8'));
}

if (errors.length > 0) {
    console.error(`Workflow policy check failed with ${errors.length} issue(s):`);
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exitCode = 1;
}
