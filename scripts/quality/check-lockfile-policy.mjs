import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonWithComments, reportErrors } from './lib-checks.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const policyPath = '.config/shirika/security/lockfile-policy.json';
const policy = parseJsonWithComments(await readFile(path.join(rootDir, policyPath), 'utf8'), policyPath);
const lockfilePath = path.join(rootDir, 'pnpm-lock.yaml');
const lockfile = await readFile(lockfilePath, 'utf8');
const errors = [];

for (const required of policy.allowedLockfiles ?? []) {
    try {
        await access(path.join(rootDir, required));
    } catch {
        errors.push(`${required}: required lockfile is missing`);
    }
}

for (const forbidden of policy.forbiddenLockfiles ?? []) {
    try {
        await access(path.join(rootDir, forbidden));
        errors.push(`${forbidden}: forbidden lockfile is committed`);
    } catch (error) {
        void error;
    }
}

if (!/^lockfileVersion: '9\.0'$/m.test(lockfile)) {
    errors.push('pnpm-lock.yaml must stay on lockfileVersion 9.0');
}
if (!/^\s{2}autoInstallPeers: false$/m.test(lockfile)) {
    errors.push('pnpm-lock.yaml settings.autoInstallPeers must be false');
}

for (const protocol of policy.forbiddenSpecProtocols ?? []) {
    if (lockfileHasForbiddenProtocol(lockfile, protocol)) {
        errors.push(`pnpm-lock.yaml contains forbidden dependency protocol ${protocol}`);
    }
}

const allowedHosts = new Set(policy.allowedTarballHosts ?? []);
for (const tarball of lockfileTarballs(lockfile)) {
    const url = new URL(tarball);
    if (!allowedHosts.has(url.hostname)) {
        errors.push(`pnpm-lock.yaml tarball host is not allowed: ${url.hostname}`);
    }
}

if (/^\s{2}patchedDependencies:/m.test(lockfile)) {
    errors.push('pnpm-lock.yaml must not contain patched dependency overrides without a documented policy update');
}

reportErrors('pnpm lockfile policy check', errors);

function lockfileHasForbiddenProtocol(lockfileText, protocol) {
    for (const line of lockfileText.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('specifier:') && !trimmed.startsWith('version:')) {
            continue;
        }
        const value = trimmed
            .slice(trimmed.indexOf(':') + 1)
            .trim()
            .replaceAll('"', '')
            .replaceAll("'", '');
        if (value.startsWith(protocol)) {
            return true;
        }
    }
    return false;
}

function lockfileTarballs(lockfileText) {
    const tarballs = [];
    for (const line of lockfileText.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('tarball: ')) {
            tarballs.push(trimmed.slice('tarball: '.length).replace(/,$/, ''));
        }
    }
    return tarballs;
}
