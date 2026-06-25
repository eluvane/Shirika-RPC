import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonWithComments, readUtf8, reportErrors } from './lib-checks.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const errors = [];
const tsconfigPaths = {
    base: '.config/shirika/typescript/base.json',
    build: '.config/shirika/typescript/build.json',
    eslint: '.config/shirika/typescript/eslint.json',
    root: 'tsconfig.json',
    types: '.config/shirika/typescript/types.json',
};
const base = await readJsonConfig(tsconfigPaths.base);
const build = await readJsonConfig(tsconfigPaths.build);
const lint = await readJsonConfig(tsconfigPaths.eslint);
const root = await readJsonConfig(tsconfigPaths.root);
const types = await readJsonConfig(tsconfigPaths.types);

const requiredCompilerOptions = {
    alwaysStrict: true,
    declaration: true,
    declarationMap: true,
    exactOptionalPropertyTypes: true,
    forceConsistentCasingInFileNames: true,
    isolatedModules: true,
    module: 'NodeNext',
    moduleDetection: 'force',
    moduleResolution: 'NodeNext',
    newLine: 'lf',
    noFallthroughCasesInSwitch: true,
    noImplicitAny: true,
    noImplicitOverride: true,
    noImplicitReturns: true,
    noImplicitThis: true,
    noUncheckedIndexedAccess: true,
    resolveJsonModule: true,
    allowUnreachableCode: false,
    allowUnusedLabels: false,
    skipLibCheck: true,
    strict: true,
    target: 'ES2025',
    useUnknownInCatchVariables: true,
    verbatimModuleSyntax: true,
};

for (const [key, expected] of Object.entries(requiredCompilerOptions)) {
    const actual = base.compilerOptions?.[key];
    if (actual !== expected) {
        errors.push(`${tsconfigPaths.base} compilerOptions.${key} must be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
}

if (!Array.isArray(base.compilerOptions?.lib) || !base.compilerOptions.lib.includes('WebWorker') || !base.compilerOptions.lib.includes('DOM')) {
    errors.push(`${tsconfigPaths.base} must keep DOM and WebWorker libs for browser worker APIs`);
}

if (root.extends !== './.config/shirika/typescript/base.json') {
    errors.push('tsconfig.json must stay as the root TypeScript/IDE wrapper and extend ./.config/shirika/typescript/base.json');
}
if (
    !Array.isArray(root.include) ||
    !root.include.includes('src/**/*.ts') ||
    !root.include.includes('.config/shirika/test/vitest.config.ts') ||
    !root.include.includes('.config/shirika/test/vitest.shims.d.ts')
) {
    errors.push('tsconfig.json must include src/**/*.ts and the moved Vitest typed config/shims');
}
if (!Array.isArray(build.references) || !build.references.some((reference) => reference.path === './types.json')) {
    errors.push(`${tsconfigPaths.build} must build declaration project reference ./types.json`);
}
if (types.extends !== './base.json' || types.compilerOptions?.emitDeclarationOnly !== true || types.compilerOptions?.noEmit !== false) {
    errors.push(`${tsconfigPaths.types} must emit declarations only from the shared base config`);
}
if (types.compilerOptions?.rootDir !== '../../../src' || types.compilerOptions?.outDir !== '../../../dist') {
    errors.push(`${tsconfigPaths.types} must keep source and dist paths rooted at the repository root`);
}
if (
    !Array.isArray(lint.include) ||
    !lint.include.includes('../../../test/**/*.ts') ||
    !lint.include.includes('../../../test-d/**/*.ts') ||
    !lint.include.includes('../test/vitest.config.ts')
) {
    errors.push(`${tsconfigPaths.eslint} must include tests, tsd tests, and the moved Vitest config for typed linting`);
}

reportErrors('TypeScript config policy check', errors);

async function readJsonConfig(relativePath) {
    return parseJsonWithComments(await readUtf8(path.join(rootDir, relativePath)), relativePath);
}
