import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readUtf8, reportErrors, toPosix, walkFiles } from './lib-checks.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const errors = [];
const sourceExtensions = ['.ts', '.mts', '.cts', '.mjs', '.js', '.cjs'];
const graph = new Map();

const files = await walkFiles(rootDir, {
    include: (relative) => sourceExtensions.some((extension) => relative.endsWith(extension)) && !relative.endsWith('.d.ts') && !relative.endsWith('.d.mts'),
});
const relativeFiles = new Set(files.map((file) => file.relative));

for (const file of files) {
    const imports = [];
    const text = await readUtf8(file.absolute);
    for (const specifier of extractRuntimeImportSpecifiers(text)) {
        checkSpecifier(file.relative, specifier);
        const resolved = await resolveInternalImport(file.relative, specifier, relativeFiles);
        if (resolved) {
            imports.push(resolved);
        }
    }
    graph.set(file.relative, imports);
}

for (const cycle of findCycles(graph)) {
    errors.push(`import cycle detected: ${cycle.join(' -> ')}`);
}

reportErrors('Import boundary check', errors);

function extractRuntimeImportSpecifiers(text) {
    return [...extractStaticImportSpecifiers(text), ...extractDynamicImportSpecifiers(text)];
}

function extractStaticImportSpecifiers(text) {
    const specifiers = [];
    for (const statement of text.split(';')) {
        const trimmed = statement.trimStart();
        if (trimmed.startsWith('import type ') || trimmed.startsWith('export type ')) {
            continue;
        }
        if (trimmed.startsWith('import ')) {
            const fromIndex = trimmed.indexOf(' from ');
            const searchFrom = fromIndex >= 0 ? fromIndex + ' from '.length : 'import '.length;
            const specifier = firstQuotedValue(trimmed, searchFrom);
            if (specifier) {
                specifiers.push(specifier);
            }
        } else if (trimmed.startsWith('export ')) {
            const fromIndex = trimmed.indexOf(' from ');
            if (fromIndex >= 0) {
                const specifier = firstQuotedValue(trimmed, fromIndex + ' from '.length);
                if (specifier) {
                    specifiers.push(specifier);
                }
            }
        }
    }
    return specifiers;
}

function extractDynamicImportSpecifiers(text) {
    const specifiers = [];
    let searchFrom = 0;
    while (searchFrom < text.length) {
        const importIndex = text.indexOf('import', searchFrom);
        if (importIndex < 0) {
            break;
        }
        const openParenIndex = skipWhitespace(text, importIndex + 'import'.length);
        if (text[openParenIndex] === '(') {
            const quoteIndex = skipWhitespace(text, openParenIndex + 1);
            const specifier = quotedValueAt(text, quoteIndex);
            if (specifier) {
                specifiers.push(specifier);
            }
        }
        searchFrom = importIndex + 'import'.length;
    }
    return specifiers;
}

function firstQuotedValue(text, searchFrom) {
    for (let index = searchFrom; index < text.length; index += 1) {
        if (text[index] === "'" || text[index] === '"') {
            return quotedValueAt(text, index);
        }
    }
    return undefined;
}

function quotedValueAt(text, quoteIndex) {
    const quote = text[quoteIndex];
    if (quote !== "'" && quote !== '"') {
        return undefined;
    }
    const end = text.indexOf(quote, quoteIndex + 1);
    return end >= 0 ? text.slice(quoteIndex + 1, end) : undefined;
}

function skipWhitespace(text, start) {
    let index = start;
    while (text[index] === ' ' || text[index] === '\n' || text[index] === '\r' || text[index] === '\t') {
        index += 1;
    }
    return index;
}

function checkSpecifier(importer, specifier) {
    if (specifier.startsWith('shirika-rpc') && !/^(test-d|scripts\/quality\/pack-smoke\.mjs)/.test(importer)) {
        errors.push(`${importer}: package self-import is forbidden outside public API tests: ${specifier}`);
    }
    if (importer.startsWith('src/') && (specifier.startsWith('dist/') || specifier.startsWith('./dist/') || specifier.startsWith('../dist/'))) {
        errors.push(`${importer}: dist imports are forbidden: ${specifier}`);
    }
    if (importer.startsWith('src/core/') && specifier.includes('adapters/')) {
        errors.push(`${importer}: core must not import adapters: ${specifier}`);
    }
    if (/^(src\/browser\.ts|src\/worker-browser\.ts|src\/adapters\/browser-)/.test(importer) && specifier.startsWith('node:')) {
        errors.push(`${importer}: browser entrypoints must not import Node builtins: ${specifier}`);
    }
    if (importer.startsWith('src/') && (specifier.startsWith('./') || specifier.startsWith('../')) && !/\.(?:js|mjs|cjs|json)$/.test(specifier)) {
        errors.push(`${importer}: relative runtime imports must include NodeNext output extension: ${specifier}`);
    }
}

async function resolveInternalImport(importer, specifier, relativeFiles) {
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
        return undefined;
    }
    const importerDirectory = path.dirname(path.join(rootDir, importer));
    const absoluteBase = path.resolve(importerDirectory, specifier);
    const candidates = [];
    const extension = path.extname(absoluteBase);
    if (extension === '.js') {
        candidates.push(`${absoluteBase.slice(0, -3)}.ts`, `${absoluteBase.slice(0, -3)}.mjs`, absoluteBase);
    } else if (extension === '.mjs') {
        candidates.push(`${absoluteBase.slice(0, -4)}.mts`, absoluteBase);
    } else if (extension === '.cjs') {
        candidates.push(`${absoluteBase.slice(0, -4)}.cts`, absoluteBase);
    } else {
        candidates.push(absoluteBase);
    }
    for (const candidate of candidates) {
        const relative = toPosix(path.relative(rootDir, candidate));
        if (relativeFiles.has(relative)) {
            return relative;
        }
        try {
            await access(candidate);
            return relative;
        } catch (error) {
            void error;
        }
    }
    return undefined;
}

function findCycles(importGraph) {
    const cycles = [];
    const visiting = new Set();
    const visited = new Set();
    const stack = [];

    for (const node of importGraph.keys()) {
        visit(node);
    }
    return cycles;

    function visit(node) {
        if (visited.has(node)) {
            return;
        }
        if (visiting.has(node)) {
            const start = stack.indexOf(node);
            cycles.push([...stack.slice(start), node]);
            return;
        }
        visiting.add(node);
        stack.push(node);
        for (const dependency of importGraph.get(node) ?? []) {
            if (importGraph.has(dependency)) {
                visit(dependency);
            }
        }
        stack.pop();
        visiting.delete(node);
        visited.add(node);
    }
}
