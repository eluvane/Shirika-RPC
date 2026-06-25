import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonWithComments, reportErrors, walkFiles } from './lib-checks.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const packageJson = parseJsonWithComments(await readFile(path.join(rootDir, 'package.json'), 'utf8'), 'package.json');
const scripts = new Set(Object.keys(packageJson.scripts ?? {}));
const errors = [];
const workflowFiles = await walkFiles(path.join(rootDir, '.github', 'workflows'), {
    include: (relative) => relative.endsWith('.yml') || relative.endsWith('.yaml'),
});

for (const file of workflowFiles) {
    const text = await readFile(file.absolute, 'utf8');
    for (const scriptName of extractPnpmRunScripts(text)) {
        if (!scripts.has(scriptName)) {
            errors.push(`${path.posix.join('.github/workflows', file.relative)}: references missing package script ${scriptName}`);
        }
    }
    const jobsStart = text.indexOf('jobs:\n');
    const jobsText = jobsStart >= 0 ? text.slice(jobsStart) : '';
    for (const job of workflowJobs(jobsText)) {
        if (!jobHasTimeout(job.block)) {
            errors.push(`${path.posix.join('.github/workflows', file.relative)}: job ${job.name} must set timeout-minutes`);
        }
    }
    if (text.includes('uses: actions/checkout@') && !text.includes('persist-credentials: false')) {
        errors.push(`${path.posix.join('.github/workflows', file.relative)}: actions/checkout must set persist-credentials: false`);
    }
}

reportErrors('CI/package script consistency check', errors);

function extractPnpmRunScripts(text) {
    const scriptNames = [];
    for (const line of text.split('\n')) {
        let searchFrom = 0;
        while (searchFrom < line.length) {
            const commandStart = line.indexOf('pnpm run', searchFrom);
            if (commandStart < 0) {
                break;
            }
            const words = splitWords(line.slice(commandStart));
            const scriptToken = words[2] === '-s' ? words[3] : words[2];
            const scriptName = takeScriptName(scriptToken ?? '');
            if (scriptName) {
                scriptNames.push(scriptName);
            }
            searchFrom = commandStart + 'pnpm run'.length;
        }
    }
    return scriptNames;
}

function workflowJobs(jobsText) {
    const jobs = [];
    const lines = jobsText.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!isWorkflowJobHeader(line)) {
            continue;
        }
        const block = [line];
        for (let blockIndex = index + 1; blockIndex < lines.length && !isWorkflowJobHeader(lines[blockIndex]); blockIndex += 1) {
            block.push(lines[blockIndex]);
        }
        jobs.push({ name: line.trim().slice(0, -1), block: block.join('\n') });
    }
    return jobs;
}

function jobHasTimeout(jobBlock) {
    for (const line of jobBlock.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('timeout-minutes:') && hasAsciiDigit(trimmed)) {
            return true;
        }
    }
    return false;
}

function isWorkflowJobHeader(line) {
    if (!line.startsWith('  ') || line.startsWith('    ')) {
        return false;
    }
    const trimmed = line.trim();
    if (!trimmed.endsWith(':')) {
        return false;
    }
    const name = trimmed.slice(0, -1);
    return name.length > 0 && [...name].every(isJobNameCharacter);
}

function splitWords(text) {
    const words = [];
    let current = '';
    for (const character of text) {
        if (character === ' ' || character === '\t') {
            if (current) {
                words.push(current);
                current = '';
            }
            continue;
        }
        current += character;
    }
    if (current) {
        words.push(current);
    }
    return words;
}

function takeScriptName(token) {
    let scriptName = '';
    for (const character of token) {
        if (!isScriptNameCharacter(character)) {
            break;
        }
        scriptName += character;
    }
    return scriptName;
}

function hasAsciiDigit(text) {
    return [...text].some((character) => character >= '0' && character <= '9');
}

function isJobNameCharacter(character) {
    return isAsciiAlphaNumeric(character) || character === '_' || character === '-';
}

function isScriptNameCharacter(character) {
    return isAsciiAlphaNumeric(character) || character === '_' || character === ':' || character === '.' || character === '-';
}

function isAsciiAlphaNumeric(character) {
    return (character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9');
}
