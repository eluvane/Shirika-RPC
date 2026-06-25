import { readFile } from 'node:fs/promises';

let prettier;
try {
    prettier = await import('prettier');
} catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') {
        throw error;
    }
}

export async function formatJsonFixture(value, filePath, configPath) {
    const serialized = JSON.stringify(value);
    if (prettier !== undefined) {
        const options = (await prettier.resolveConfig(filePath, { config: configPath })) ?? {};
        return prettier.format(serialized, { ...options, filepath: filePath, parser: 'json' });
    }

    const fallback = `${JSON.stringify(value, null, 2)}\n`;
    try {
        const existing = await readFile(filePath, 'utf8');
        if (JSON.stringify(JSON.parse(existing)) === serialized) {
            return existing;
        }
    } catch {
        return fallback;
    }
    return fallback;
}
