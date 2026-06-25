import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const textExtensions = new Set([
    '.cjs',
    '.css',
    '.cts',
    '.html',
    '.js',
    '.json',
    '.jsonc',
    '.jsx',
    '.md',
    '.mjs',
    '.mts',
    '.sh',
    '.toml',
    '.ts',
    '.tsx',
    '.txt',
    '.yaml',
    '.yml',
]);
export const generatedDirectories = new Set(['.bench', '.git', '.lake', '.tsbuildinfo', 'coverage', 'dist', 'node_modules']);
export const generatedRelativeDirectories = new Set(['.benchmark/current', '.benchmark/previous', '.benchmark/comparison', '.benchmark/smoke']);

export function toPosix(filePath) {
    return filePath.split(path.sep).join('/');
}

export async function readUtf8(filePath) {
    return readFile(filePath, 'utf8');
}

export async function walkFiles(rootDir, options = {}) {
    const excludedDirectories = new Set(options.excludedDirectories ?? generatedDirectories);
    const files = [];
    await visit(rootDir);
    return files.sort((left, right) => left.relative.localeCompare(right.relative));

    async function visit(directory) {
        const entries = await readdir(directory, { withFileTypes: true });
        for (const entry of entries) {
            const absolute = path.join(directory, entry.name);
            const relative = toPosix(path.relative(rootDir, absolute));
            if (entry.isDirectory()) {
                if (!excludedDirectories.has(entry.name) && !generatedRelativeDirectories.has(relative) && !(options.excludeRelative?.(relative) ?? false)) {
                    await visit(absolute);
                }
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            if (options.include && !options.include(relative, absolute)) {
                continue;
            }
            if (options.exclude?.(relative, absolute)) {
                continue;
            }
            files.push({ absolute, relative });
        }
    }
}

export function parseJsonWithComments(text, filePath) {
    try {
        return JSON.parse(stripJsonComments(text));
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${filePath}: invalid JSON/JSONC: ${message}`, { cause: error });
    }
}

export function stripJsonComments(text) {
    let output = '';
    let inString = false;
    let stringQuote = '';
    let escaped = false;

    for (let index = 0; index < text.length; index += 1) {
        const current = text[index];
        const next = text[index + 1];

        if (inString) {
            output += current;
            if (escaped) {
                escaped = false;
            } else if (current === '\\') {
                escaped = true;
            } else if (current === stringQuote) {
                inString = false;
            }
            continue;
        }

        if (current === '"' || current === "'") {
            inString = true;
            stringQuote = current;
            output += current;
            continue;
        }

        if (current === '/' && next === '/') {
            while (index < text.length && text[index] !== '\n') {
                index += 1;
            }
            output += '\n';
            continue;
        }

        if (current === '/' && next === '*') {
            index += 2;
            while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) {
                if (text[index] === '\n') {
                    output += '\n';
                }
                index += 1;
            }
            index += 1;
            continue;
        }

        output += current;
    }

    return output.replaceAll(/,\s*([}\]])/g, '$1');
}

export function reportErrors(title, errors) {
    if (errors.length === 0) {
        return;
    }
    console.error(`${title} failed with ${errors.length} issue(s):`);
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exitCode = 1;
}
