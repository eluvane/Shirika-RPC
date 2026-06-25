import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonWithComments, readUtf8, reportErrors, walkFiles } from './lib-checks.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const leanRoot = path.join(rootDir, 'formal', 'lean');
const errors = [];

await checkLeanToolchain();
await checkLakefile();
await checkManifest();
await checkLeanSources();
await checkAggregationModule();

reportErrors('Lean formal-layer policy check', errors);

async function checkLeanToolchain() {
    const toolchain = (await readUtf8(path.join(leanRoot, 'lean-toolchain'))).trim();
    if (toolchain !== 'leanprover/lean4:v4.31.0') {
        errors.push(`formal/lean/lean-toolchain must pin leanprover/lean4:v4.31.0, got ${toolchain}`);
    }
}

async function checkLakefile() {
    const lakefilePath = path.join(leanRoot, 'lakefile.toml');
    const lakefile = await readUtf8(lakefilePath);
    if (!/^name\s*=\s*"ShirikaRpcFormal"$/m.test(lakefile)) {
        errors.push('formal/lean/lakefile.toml must keep the ShirikaRpcFormal package name');
    }
    if (!/^defaultTargets\s*=\s*\["Shirika"\]$/m.test(lakefile)) {
        errors.push('formal/lean/lakefile.toml must keep Shirika as the default target');
    }
    if (!/^builtinLint\s*=\s*true$/m.test(lakefile)) {
        errors.push('formal/lean/lakefile.toml must enable builtinLint = true so lake lint runs the built-in Lean linters');
    }
    if (/lakefile\.lean/.test(lakefile)) {
        errors.push('formal/lean/lakefile.toml must remain declarative TOML; do not introduce build-time Lean scripting here');
    }
}

async function checkManifest() {
    const manifestPath = path.join(leanRoot, 'lake-manifest.json');
    const manifest = parseJsonWithComments(await readUtf8(manifestPath), 'formal/lean/lake-manifest.json');
    if (!Array.isArray(manifest.packages)) {
        errors.push('formal/lean/lake-manifest.json must be committed and parse as a Lake manifest');
    }
}

async function checkLeanSources() {
    const leanFiles = await walkFiles(leanRoot, {
        include: (relative) => relative.endsWith('.lean'),
        excludedDirectories: new Set(['.lake']),
    });
    const forbidden = [
        { pattern: /\bsorry\b|sorryAx/, message: 'sorry/sorryAx is forbidden in committed Lean sources' },
        { pattern: /\baxiom\b/, message: 'custom axioms require a formal trust-policy update and are forbidden by default' },
        { pattern: /\bunsafe\b/, message: 'unsafe Lean code is forbidden in the proof layer' },
        { pattern: /\bpartial\b/, message: 'partial Lean definitions are forbidden in the proof layer' },
        { pattern: /^\s*import\s+Mathlib\b/m, message: 'broad Mathlib import is forbidden in this standalone core model' },
    ];
    for (const file of leanFiles) {
        const text = await readUtf8(file.absolute);
        for (const rule of forbidden) {
            if (rule.pattern.test(text)) {
                errors.push(`formal/lean/${file.relative}: ${rule.message}`);
            }
        }
    }
}

async function checkAggregationModule() {
    const aggregation = await readUtf8(path.join(leanRoot, 'Shirika.lean'));
    const leanFiles = await collectLeanModules();
    for (const moduleName of leanFiles) {
        if (moduleName === 'Shirika') {
            continue;
        }
        if (!aggregation.includes(`import ${moduleName}`)) {
            errors.push(`formal/lean/Shirika.lean must import ${moduleName} so the default target covers the proof module`);
        }
    }
}

async function collectLeanModules() {
    const modules = [];
    await visit(leanRoot);
    return modules.sort();

    async function visit(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== '.lake') {
                    await visit(absolute);
                }
                continue;
            }
            if (!entry.isFile() || !entry.name.endsWith('.lean')) {
                continue;
            }
            const relative = path.relative(leanRoot, absolute).split(path.sep).join('/');
            modules.push(relative.replace(/\.lean$/, '').replaceAll('/', '.'));
        }
    }
}
