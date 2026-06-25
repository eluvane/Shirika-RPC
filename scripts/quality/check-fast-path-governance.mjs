#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const strategyPath = resolve(repoRoot, 'src/core/fast-path-strategy.ts');
const strategySource = readText(strategyPath);
const errors = [];

const requiredFlags = [
    'preparedContractReuse',
    'validatedFrameWitness',
    'validatedAlignedBytesPayload',
    'preparedBinaryCodecWriter',
    'specializedCompositeWriter',
    'readSideEncodedPayload',
    'pendingRequestWitness',
];

const expectedUsage = new Map([
    ['preparedContractReuse', ['src/core/rpc/contract.ts']],
    ['validatedFrameWitness', ['src/core/ring/endpoint.ts']],
    ['validatedAlignedBytesPayload', ['src/core/ring/endpoint.ts']],
    ['preparedBinaryCodecWriter', ['src/core/codec/witness.ts']],
    ['specializedCompositeWriter', ['src/core/codec/witness.ts']],
    ['readSideEncodedPayload', ['src/core/codec/witness.ts']],
    ['pendingRequestWitness', ['src/core/rpc/client.ts']],
]);

for (const flag of requiredFlags) {
    const record = extractPolicyRecord(flag);
    if (record === undefined) {
        errors.push(`FAST_PATH_POLICY is missing flag '${flag}'.`);
        continue;
    }
    requirePattern(record, /defaultEnabled:\s*(true|false)/, flag, 'defaultEnabled');
    requirePattern(record, /experimental:\s*(true|false)/, flag, 'experimental marker');
    requirePattern(record, /disableEnv:\s*'SHIRIKA_RPC_DISABLE_[A-Z0-9_]+'/u, flag, 'disableEnv kill-switch');
    requirePattern(record, /enableEnv:\s*'SHIRIKA_RPC_ENABLE_[A-Z0-9_]+'/u, flag, 'enableEnv opt-in override');
    requirePattern(record, /fallback:\s*'[^']{24,}'/u, flag, 'safe fallback description');
    requirePattern(record, /conformanceVectors:\s*\[[^\]]*formal\/fixtures\/[^\]]*\]/su, flag, 'conformance vector reference');
    requirePattern(record, /leanModules:\s*\[[^\]]*Shirika\.[^\]]*\]/su, flag, 'Lean module reference');
    requirePattern(record, /benchmarkSuites:\s*\[[^\]]*bench\/[^\]]*\]/su, flag, 'benchmark suite reference');
    requirePattern(record, /gateLevel:\s*'(required|manual|paranoid)'/u, flag, 'gate level');

    for (const vector of extractStringArray(record, 'conformanceVectors')) {
        requireExistingPath(vector, `${flag} conformance vector`);
    }
    for (const suite of extractStringArray(record, 'benchmarkSuites')) {
        requireExistingPath(suite, `${flag} benchmark suite`);
    }

    for (const usagePath of expectedUsage.get(flag) ?? []) {
        const usageSource = readText(resolve(repoRoot, usagePath));
        if (!usageSource.includes(`'${flag}'`)) {
            errors.push(`${usagePath} does not consult fast-path strategy flag '${flag}'.`);
        }
    }
}

const readSideRecord = extractPolicyRecord('readSideEncodedPayload') ?? '';
if (!/defaultEnabled:\s*false/.test(readSideRecord) || !/experimental:\s*true/.test(readSideRecord) || !/gateLevel:\s*'manual'/.test(readSideRecord)) {
    errors.push('readSideEncodedPayload must remain disabled by default, experimental, and manually gated.');
}

for (const flag of requiredFlags.filter((flag) => flag !== 'readSideEncodedPayload')) {
    const record = extractPolicyRecord(flag) ?? '';
    if (!/defaultEnabled:\s*true/.test(record)) {
        errors.push(`${flag} must be explicitly enabled by default or deliberately documented as experimental.`);
    }
}

for (const entrypoint of ['src/index.ts', 'src/browser.ts', 'src/node.ts', 'src/worker-browser.ts', 'src/worker-node.ts']) {
    const absolute = resolve(repoRoot, entrypoint);
    if (existsSync(absolute) && readText(absolute).includes('fast-path-strategy')) {
        errors.push(`${entrypoint} must not export the internal fast-path strategy surface.`);
    }
}

const formalCodecCheck = readText(resolve(repoRoot, 'scripts/formal/check-codec-vectors.mjs'));
if (!formalCodecCheck.includes('SHIRIKA_RPC_ENABLE_READ_SIDE_ENCODED_PAYLOAD')) {
    errors.push('scripts/formal/check-codec-vectors.mjs must explicitly opt into the experimental read-side specialization for conformance checks.');
}

const witnessSource = readText(resolve(repoRoot, 'src/core/codec/witness.ts'));
for (const flag of ['preparedBinaryCodecWriter', 'specializedCompositeWriter', 'readSideEncodedPayload']) {
    if (!witnessSource.includes(`isFastPathEnabled('${flag}')`)) {
        errors.push(`src/core/codec/witness.ts must gate codec fast path '${flag}'.`);
    }
}

const endpointSource = readText(resolve(repoRoot, 'src/core/ring/endpoint.ts'));
for (const flag of ['validatedFrameWitness', 'validatedAlignedBytesPayload']) {
    if (!endpointSource.includes(`isFastPathEnabled('${flag}')`)) {
        errors.push(`src/core/ring/endpoint.ts must gate frame/aligned fast path '${flag}'.`);
    }
}
if (!endpointSource.includes('safeReadAlignedBytesPayload(') || !endpointSource.includes('safeReadAlignedBytesPayloadAsBinaryBytes(')) {
    errors.push('src/core/ring/endpoint.ts must keep checked aligned-bytes safe fallback helpers.');
}

const msgpackSource = readText(resolve(repoRoot, 'src/core/codec/msgpack.ts'));
if (/\bunsafe[A-Z_a-z]/.test(msgpackSource)) {
    errors.push('msgpack codec must not gain proof-backed unsafe helpers in Phase 8.');
}
for (const file of ['src/core/codec/specialized-readers.ts', 'src/core/codec/specialized-writers.ts', 'src/core/codec/witness.ts']) {
    const source = readText(resolve(repoRoot, file));
    if (/msgpack/i.test(source) && /unsafe|unchecked|fast-path/i.test(source)) {
        errors.push(`${file} appears to mix msgpack with proof-backed unsafe fast-path policy.`);
    }
}

if (errors.length > 0) {
    console.error('Fast-path governance policy check failed:');
    for (const error of errors) {
        console.error(` - ${error}`);
    }
    process.exit(1);
}
console.log('Fast-path governance policy check passed.');

function extractPolicyRecord(flag) {
    const marker = `flag: '${flag}'`;
    const markerIndex = strategySource.indexOf(marker);
    if (markerIndex === -1) {
        return undefined;
    }
    const start = strategySource.lastIndexOf('{', markerIndex);
    const end = strategySource.indexOf('\n    },', markerIndex);
    if (start === -1 || end === -1) {
        return undefined;
    }
    return strategySource.slice(start, end + '\n    }'.length);
}

function extractStringArray(record, property) {
    const match = record.match(new RegExp(String.raw`${property}:\s*\[([^\]]*)\]`, 'su'));
    if (!match) {
        return [];
    }
    return Array.from(match[1].matchAll(/'([^']+)'/gu), (item) => item[1]);
}

function requirePattern(record, pattern, flag, label) {
    if (!pattern.test(record)) {
        errors.push(`FAST_PATH_POLICY.${flag} is missing ${label}.`);
    }
}

function requireExistingPath(path, label) {
    if (!existsSync(resolve(repoRoot, path))) {
        errors.push(`${label} points to missing path ${path}.`);
    }
}

function readText(path) {
    try {
        return readFileSync(path, 'utf8');
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not read ${relative(repoRoot, path)}: ${message}`, { cause: error });
    }
}
