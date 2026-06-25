import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportErrors, walkFiles } from './lib-checks.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const errors = [];
const declarationFiles = await walkFiles(rootDir, {
    include: (relative) => relative.endsWith('.d.ts') || relative.endsWith('.d.mts'),
});

for (const file of declarationFiles) {
    if (file.relative.startsWith('src/')) {
        errors.push(`${file.relative}: generated declarations must not be committed under src/`);
    }
    if (file.relative.startsWith('shared/') && file.relative.endsWith('.d.ts')) {
        const mtsTwin = path.join(rootDir, file.relative.replace(/\.d\.ts$/, '.d.mts'));
        try {
            await access(mtsTwin);
        } catch {
            errors.push(`${file.relative}: shared ESM declaration twin .d.mts is missing`);
        }
    }
}

for (const pair of [
    ['shared/contract.d.ts', 'shared/contract.d.mts'],
    ['shared/handlers.d.ts', 'shared/handlers.d.mts'],
]) {
    const [left, right] = pair;
    const leftText = await readFile(path.join(rootDir, left), 'utf8');
    const rightText = await readFile(path.join(rootDir, right), 'utf8');
    if (leftText !== rightText) {
        errors.push(`${left} and ${right} must stay byte-identical`);
    }
}

reportErrors('Declaration surface policy check', errors);
