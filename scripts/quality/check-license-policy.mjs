import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const policy = JSON.parse(await readFile(path.join(rootDir, '.config/shirika/security/license-policy.json'), 'utf8'));
const args = new Set(process.argv.slice(2));
const mode = args.has('--all') ? 'all' : args.has('--dev') ? 'dev' : 'prod';
const packages = await collectInstalledPackages();
const allowed = policy.allowedLicensePatterns.map((pattern) => new RegExp(pattern, 'i'));
const denied = policy.deniedLicensePatterns.map((pattern) => new RegExp(pattern, 'i'));
const overrides = policy.packageOverrides ?? {};
const errors = [];

for (const pkg of packages) {
    const key = `${pkg.name}@${pkg.version ?? 'unknown'}`;
    const override = overrides[key] ?? overrides[pkg.name];
    const license = normalizeLicense(override?.license ?? pkg.license);
    if (override?.reason) {
        continue;
    }
    if (!license) {
        errors.push(`${key}: missing license metadata`);
        continue;
    }
    if (denied.some((pattern) => pattern.test(license))) {
        errors.push(`${key}: denied license ${license}`);
        continue;
    }
    if (!allowed.some((pattern) => pattern.test(license))) {
        errors.push(`${key}: license ${license} is not in .config/shirika/security/license-policy.json`);
    }
}

if (errors.length > 0) {
    console.error(`License policy check failed for ${mode} dependencies with ${errors.length} issue(s):`);
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exitCode = 1;
}

function normalizeLicense(value) {
    if (Array.isArray(value)) {
        return value.map((item) => normalizeLicense(item)).join(' OR ');
    }
    if (typeof value !== 'string') {
        if (value && typeof value === 'object' && 'type' in value) {
            return normalizeLicense(value.type);
        }
        return '';
    }
    return value.replaceAll(/^\(|\)$/g, '').trim();
}

async function collectInstalledPackages() {
    const found = [];
    const pnpmStoreDir = path.join(rootDir, 'node_modules', '.pnpm');
    for (const locator of await readDirectories(pnpmStoreDir)) {
        const modulesDir = path.join(pnpmStoreDir, locator, 'node_modules');
        for (const entry of await readDirectories(modulesDir)) {
            if (entry.startsWith('.')) {
                continue;
            }
            if (entry.startsWith('@')) {
                for (const scopedEntry of await readDirectories(path.join(modulesDir, entry))) {
                    await addPackage(path.join(modulesDir, entry, scopedEntry));
                }
                continue;
            }
            await addPackage(path.join(modulesDir, entry));
        }
    }
    return dedupe(found);

    async function addPackage(packageDir) {
        const packageJson = await readPackageJson(path.join(packageDir, 'package.json'));
        if (!packageJson) {
            return;
        }
        const name = typeof packageJson.name === 'string' ? packageJson.name : undefined;
        if (!name) {
            return;
        }
        const version = typeof packageJson.version === 'string' ? packageJson.version : undefined;
        const license = normalizeLicense(packageJson.license ?? packageJson.licenses);
        found.push({ name, version, license });
    }
}

async function readDirectories(directory) {
    try {
        const entries = await readdir(directory, { withFileTypes: true });
        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch {
        return [];
    }
}

async function readPackageJson(filePath) {
    try {
        return JSON.parse(await readFile(filePath, 'utf8'));
    } catch {
        return undefined;
    }
}

function dedupe(packages) {
    const byKey = new Map();
    for (const pkg of packages) {
        const key = `${pkg.name}@${pkg.version ?? 'unknown'}:${pkg.license}`;
        byKey.set(key, pkg);
    }
    return [...byKey.values()].sort((left, right) => `${left.name}@${left.version ?? ''}`.localeCompare(`${right.name}@${right.version ?? ''}`));
}
