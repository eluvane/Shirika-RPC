import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
const errors = [];

const expectedFiles = ['dist', 'README.md'];
const forbiddenLifecycleScripts = new Set(['preinstall', 'install', 'postinstall', 'prepare']);
const forbiddenLockfiles = ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'bun.lockb', 'bun.lock'];
const dependencySections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const forbiddenSpecPatterns = [/^\*$/, /^latest$/, /^file:/, /^link:/, /^workspace:/, /^git[+:]/, /^github:/, /^https?:/];
const dangerousScriptPatterns = [
    /\bcurl\b.*\|\s*(?:ba)?sh\b/,
    /\bwget\b.*\|\s*(?:ba)?sh\b/,
    /\bsudo\b/,
    /\brm\s+-rf\s+\//,
    /\bnpm\s+install\b/,
    /\byarn\s+install\b/,
];

function fail(message) {
    errors.push(message);
}

function assert(condition, message) {
    if (!condition) {
        fail(message);
    }
}

function isSorted(values) {
    return values.every((value, index) => index === 0 || values[index - 1].localeCompare(value) <= 0);
}

function checkRequiredMetadata() {
    assert(packageJson.type === 'module', 'package.json must remain ESM-only: "type" must be "module"');
    assert(packageJson.sideEffects === false, 'package.json must explicitly declare "sideEffects": false');
    assert(packageJson.license && typeof packageJson.license === 'string', 'package.json must make package license metadata explicit');
    assert(/^pnpm@\d+\.\d+\.\d+$/.test(packageJson.packageManager ?? ''), 'packageManager must pin an exact pnpm version');
    assert(packageJson.engines?.node === '>=26', 'engines.node must stay pinned to the supported Node.js floor (>=26)');
    assert(JSON.stringify(packageJson.files) === JSON.stringify(expectedFiles), `files must be exactly ${JSON.stringify(expectedFiles)}`);
}

function checkExports() {
    assert(packageJson.types === './dist/index.d.ts', 'top-level types field must point at ./dist/index.d.ts');
    assert(packageJson.exports && typeof packageJson.exports === 'object', 'package.json must define explicit exports');
    for (const [subpath, target] of Object.entries(packageJson.exports ?? {})) {
        assert(!subpath.includes('*'), `export ${subpath} must not use wildcard exports`);
        assert(target && typeof target === 'object' && !Array.isArray(target), `export ${subpath} must be an object`);
        assert(typeof target.types === 'string', `export ${subpath} must expose declaration types`);
        assert(typeof target.import === 'string', `export ${subpath} must expose an ESM import target`);
        assert(!('require' in target), `export ${subpath} must not add CommonJS require targets`);
        assert(target.types.startsWith('./dist/') && target.types.endsWith('.d.ts'), `export ${subpath} types must point into dist/*.d.ts`);
        assert(target.import.startsWith('./dist/') && target.import.endsWith('.js'), `export ${subpath} import must point into dist/*.js`);
    }
}

function checkScripts() {
    const scripts = packageJson.scripts ?? {};
    assert(typeof scripts.check === 'string', 'scripts.check must provide the primary local quality gate');
    assert(typeof scripts['check:ci'] === 'string', 'scripts.check:ci must provide the CI quality gate');
    assert(scripts.ci === 'pnpm run check:ci', 'scripts.ci must delegate to check:ci');
    for (const lifecycle of forbiddenLifecycleScripts) {
        assert(!(lifecycle in scripts), `forbidden lifecycle script "${lifecycle}" must not be present`);
    }
    for (const [name, command] of Object.entries(scripts)) {
        for (const pattern of dangerousScriptPatterns) {
            assert(!pattern.test(command), `script "${name}" contains a forbidden shell pattern: ${command}`);
        }
    }
}

function checkDependencies() {
    const seen = new Map();
    for (const section of dependencySections) {
        const dependencies = packageJson[section];
        if (dependencies === undefined) {
            continue;
        }
        assert(dependencies && typeof dependencies === 'object' && !Array.isArray(dependencies), `${section} must be an object`);
        const names = Object.keys(dependencies);
        assert(isSorted(names), `${section} must be sorted alphabetically`);
        for (const [name, spec] of Object.entries(dependencies)) {
            assert(typeof spec === 'string' && spec.length > 0, `${section}.${name} must have a non-empty version spec`);
            for (const pattern of forbiddenSpecPatterns) {
                assert(!pattern.test(spec), `${section}.${name} must use a registry semver range, not ${JSON.stringify(spec)}`);
            }
            const previousSection = seen.get(name);
            assert(!previousSection, `${name} is duplicated in ${previousSection} and ${section}`);
            seen.set(name, section);
        }
    }
}

async function checkLockfiles() {
    for (const lockfile of forbiddenLockfiles) {
        try {
            await access(path.join(rootDir, lockfile));
            fail(`${lockfile} must not be committed to this pnpm-managed repository`);
        } catch (error) {
            void error;
        }
    }
}

checkRequiredMetadata();
checkExports();
checkScripts();
checkDependencies();
await checkLockfiles();

if (errors.length > 0) {
    console.error(`Package policy check failed with ${errors.length} issue(s):`);
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exitCode = 1;
}
