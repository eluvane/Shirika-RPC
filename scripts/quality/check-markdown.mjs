import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readUtf8, reportErrors, walkFiles } from './lib-checks.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const errors = [];
const files = await walkFiles(rootDir, {
    include: (relative) => relative.endsWith('.md'),
});

for (const file of files) {
    const text = await readUtf8(file.absolute);
    const lines = text.split('\n');
    let inFence = false;
    let lastHeadingLevel = 0;
    const headings = new Set();

    for (const [index, line] of lines.entries()) {
        const lineNumber = index + 1;
        const fence = line.match(/^```(.*)$/);
        if (fence) {
            if (!inFence && fence[1].trim() === '') {
                errors.push(`${file.relative}:${lineNumber}: fenced code blocks must declare a language`);
            }
            inFence = !inFence;
            continue;
        }
        if (inFence) {
            continue;
        }
        const heading = line.match(/^(#{1,6})\s+(.+)$/);
        if (heading) {
            const level = heading[1].length;
            const title = heading[2].trim().replaceAll(/\s+#+$/g, '');
            if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
                errors.push(`${file.relative}:${lineNumber}: heading level jumps from H${lastHeadingLevel} to H${level}`);
            }
            const key = `${level}:${title.toLowerCase()}`;
            if (headings.has(key)) {
                errors.push(`${file.relative}:${lineNumber}: duplicate sibling heading "${title}"`);
            }
            headings.add(key);
            lastHeadingLevel = level;
        }
        if (/\bclick here\b|\bhere\b/i.test(line) && /\[[^\]]*(?:click here|here)[^\]]*\]\(/i.test(line)) {
            errors.push(`${file.relative}:${lineNumber}: link text must describe the target, not "here"`);
        }
        if (/\bTODO\b|\bFIXME\b/.test(line)) {
            errors.push(`${file.relative}:${lineNumber}: TODO/FIXME markers are not allowed in docs`);
        }
        if (/https?:\/\/[^\s)>]+/.test(line) && !/\b(?:href|src)="https?:\/\//.test(line) && !/\]\(https?:\/\//.test(line)) {
            errors.push(`${file.relative}:${lineNumber}: bare URL found; wrap it in Markdown link syntax`);
        }
    }
    if (inFence) {
        errors.push(`${file.relative}: unclosed fenced code block`);
    }
}

reportErrors('Markdown policy check', errors);
