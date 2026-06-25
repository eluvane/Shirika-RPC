import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonWithComments, readUtf8, reportErrors, walkFiles } from './lib-checks.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const errors = [];
const files = await walkFiles(rootDir, {
    include: (relative) => relative.endsWith('.json') || relative.endsWith('.jsonc'),
    exclude: (relative) => relative === 'pnpm-lock.yaml',
});

for (const file of files) {
    const text = await readUtf8(file.absolute);
    try {
        parseJsonWithComments(text, file.relative);
    } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
    }
}

reportErrors('JSON/JSONC syntax check', errors);
