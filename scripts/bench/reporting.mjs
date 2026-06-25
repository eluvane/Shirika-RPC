import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
export function readCliOption(argv, flag) {
    const index = argv.indexOf(flag);
    if (index < 0) {
        return undefined;
    }
    return argv[index + 1];
}
export async function writeJsonFile(filePath, value) {
    await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
export async function writeTextFile(filePath, value) {
    if (!filePath) {
        return;
    }
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, value, 'utf8');
}
export function mean(values) {
    if (values.length === 0) {
        return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
export function percentile(values, percentileValue) {
    if (values.length === 0) {
        return 0;
    }
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(sorted.length - 1, Math.floor((percentileValue / 100) * sorted.length));
    return sorted[index] ?? 0;
}
export function formatBytes(value) {
    if (value >= 1024 * 1024 * 1024) {
        return `${Math.round(value / (1024 * 1024 * 1024))}GiB`;
    }
    if (value >= 1024 * 1024) {
        return `${Math.round(value / (1024 * 1024))}MiB`;
    }
    if (value >= 1024) {
        return `${Math.round(value / 1024)}KiB`;
    }
    return `${value}B`;
}
export function formatNumber(value, fractionDigits = 2) {
    return Number.isFinite(value) ? value.toFixed(fractionDigits) : '0.00';
}
export function formatDeltaPercent(value) {
    if (!Number.isFinite(value)) {
        return 'n/a';
    }
    const prefix = value > 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}%`;
}
export function renderMarkdownTable(headers, rows) {
    const header = `| ${headers.join(' | ')} |`;
    const separator = `| ${headers.map(() => '---').join(' | ')} |`;
    const body = rows.map((row) => `| ${row.join(' | ')} |`);
    return [header, separator, ...body].join('\n');
}
