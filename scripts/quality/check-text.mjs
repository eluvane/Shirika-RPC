import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const excludedDirectories = new Set(['.bench', '.git', '.lake', '.tsbuildinfo', 'coverage', 'dist', 'node_modules']);
const excludedRelativeDirectories = new Set(['.benchmark/current', '.benchmark/previous', '.benchmark/comparison', '.benchmark/smoke']);
const textExtensions = new Set([
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
const textFilenames = new Set(['.editorconfig', '.gitignore', 'markdownlintignore', 'prettierignore']);
const ignoredFiles = new Set(['pnpm-lock.yaml']);

const errors = [];

async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
        const absolutePath = path.join(directory, entry.name);
        const relativePath = path.relative(rootDir, absolutePath).split(path.sep).join('/');
        if (entry.isDirectory()) {
            if (!excludedDirectories.has(entry.name) && !excludedRelativeDirectories.has(relativePath)) {
                await walk(absolutePath);
            }
            continue;
        }
        if (!entry.isFile() || ignoredFiles.has(relativePath)) {
            continue;
        }
        if (!shouldCheckFile(entry.name)) {
            continue;
        }
        await checkFile(absolutePath, relativePath);
    }
}

function shouldCheckFile(filename) {
    return textFilenames.has(filename) || textExtensions.has(path.extname(filename));
}

async function checkFile(absolutePath, relativePath) {
    const buffer = await readFile(absolutePath);
    const text = buffer.toString('utf8');
    if (text.includes('\u0000')) {
        errors.push(`${relativePath}: contains NUL bytes`);
    }
    if (text.includes('\r')) {
        errors.push(`${relativePath}: must use LF line endings`);
    }
    if (text.length > 0 && !text.endsWith('\n')) {
        errors.push(`${relativePath}: missing final newline`);
    }
    const lines = text.split('\n');
    for (const [index, line] of lines.entries()) {
        const lineNumber = index + 1;
        if (/[ \t]+$/.test(line)) {
            errors.push(`${relativePath}:${lineNumber}: trailing whitespace`);
        }
        if (/^<<<<<<< |^=======|^>>>>>>> /.test(line)) {
            errors.push(`${relativePath}:${lineNumber}: unresolved merge conflict marker`);
        }
        if (/\t/.test(line) && !relativePath.endsWith('.md')) {
            errors.push(`${relativePath}:${lineNumber}: tab character outside Markdown`);
        }
    }
}

await walk(rootDir);

if (errors.length > 0) {
    console.error(`Text hygiene check failed with ${errors.length} issue(s):`);
    for (const error of errors) {
        console.error(`- ${error}`);
    }
    process.exitCode = 1;
}
