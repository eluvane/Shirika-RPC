import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonWithComments, readUtf8, reportErrors, walkFiles } from './lib-checks.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const errors = [];
const packageJson = parseJsonWithComments(await readUtf8(path.join(rootDir, 'package.json')), 'package.json');
const manifestPath = '.config/shirika/quality/lint-manifest.json';
const lintManifest = parseJsonWithComments(await readUtf8(path.join(rootDir, manifestPath)), manifestPath);
const scripts = packageJson.scripts ?? {};
const scriptNames = new Set(Object.keys(scripts));
const pnpmVersion = parsePackageManagerVersion(packageJson.packageManager);
const interpolationPrefix = '$';
const corepackPreparePnpmEnv = `corepack prepare "pnpm@${interpolationPrefix}{PNPM_VERSION}"`;
const githubMatrixNode = `${interpolationPrefix}{{ matrix.node }}`;

checkLintManifest();
checkScriptToolPins();
await checkWorkflowRuntimePins();

reportErrors('Tooling and lint orchestration policy check', errors);

function checkLintManifest() {
    const requiredGroups = ['required', 'required-no-format', 'strict', 'paranoid', 'repo'];
    for (const group of requiredGroups) {
        if (!Array.isArray(lintManifest[group]) || lintManifest[group].length === 0) {
            errors.push(`${manifestPath}: ${group} must be a non-empty script list`);
            continue;
        }
        for (const scriptName of lintManifest[group]) {
            if (!scriptNames.has(scriptName)) {
                errors.push(`${manifestPath}: ${group} references missing package script ${scriptName}`);
            }
        }
    }

    const expectedRequiredNoFormat = (lintManifest.required ?? []).filter((scriptName) => scriptName !== 'lint:format');
    if (JSON.stringify(lintManifest['required-no-format']) !== JSON.stringify(expectedRequiredNoFormat)) {
        errors.push(`${manifestPath}: required-no-format must equal required minus lint:format for CI split-format jobs`);
    }

    const mandatoryRequiredScripts = [
        'lint:text',
        'lint:json',
        'lint:markdown',
        'lint:package',
        'lint:lockfile',
        'lint:tsconfig',
        'lint:source',
        'lint:fast-path-governance',
        'lint:imports',
        'lint:declarations',
        'lint:workflows',
        'lint:ci-consistency',
        'lint:tooling-policy',
        'lint:lean-source',
        'lint:eslint',
        'lint:format',
    ];
    for (const scriptName of mandatoryRequiredScripts) {
        if (!lintManifest.required?.includes(scriptName)) {
            errors.push(`${manifestPath}: required lint gate must include ${scriptName}`);
        }
    }

    if (scripts.lint !== 'node scripts/quality/lint.mjs required') {
        errors.push('package.json scripts.lint must stay the single-command required local lint gate');
    }
    if (scripts['lint:required:nonformat'] !== 'node scripts/quality/lint.mjs required-no-format') {
        errors.push('package.json scripts.lint:required:nonformat must expose the CI split-format lint group');
    }
}

function checkScriptToolPins() {
    for (const [scriptName, command] of Object.entries(scripts)) {
        // eslint-disable-next-line security/detect-unsafe-regex -- Static policy scan over short package.json script text.
        for (const match of command.matchAll(/\b(?:pnpm\s+)?dlx\s+([^\s"']+)/g)) {
            const specifier = match[1];
            if (!hasExactPackageVersion(specifier)) {
                errors.push(`package.json script ${scriptName}: pnpm dlx tool must pin an exact version, got ${specifier}`);
            }
        }
        for (const match of command.matchAll(/\bgo\s+install\s+([^\s"']+)/g)) {
            const specifier = match[1];
            if (!/@v?\d+\.\d+\.\d+(?:$|\s)/.test(specifier)) {
                errors.push(`package.json script ${scriptName}: go install tool must pin an exact module version, got ${specifier}`);
            }
        }
        if (/\bnpx\b/.test(command)) {
            errors.push(`package.json script ${scriptName}: npx is forbidden; use pinned pnpm dlx or a devDependency binary`);
        }
        if (/\bpnpm\s+audit\b/.test(command) && !/--audit-level\s+(?:moderate|high|critical)/.test(command)) {
            errors.push(`package.json script ${scriptName}: pnpm audit must set an explicit --audit-level`);
        }
    }
}

async function checkWorkflowRuntimePins() {
    const workflowFiles = await walkFiles(path.join(rootDir, '.github', 'workflows'), {
        include: (relative) => relative.endsWith('.yml') || relative.endsWith('.yaml'),
    });
    for (const file of workflowFiles) {
        const text = await readFile(file.absolute, 'utf8');
        if (pnpmVersion !== undefined && !text.includes(`PNPM_VERSION: ${pnpmVersion}`) && text.includes(corepackPreparePnpmEnv)) {
            errors.push(`${path.posix.join('.github/workflows', file.relative)}: PNPM_VERSION must match packageManager ${packageJson.packageManager}`);
        }
        for (const match of text.matchAll(/^\s*node-version:\s*([^\n#]+)/gm)) {
            const value = match[1].trim().replaceAll("'", '').replaceAll('"', '');
            if (value !== '26' && value !== githubMatrixNode) {
                errors.push(`${path.posix.join('.github/workflows', file.relative)}: node-version must be 26 or the pinned matrix value, got ${value}`);
            }
        }
        if (/matrix:\s*\n(?:.|\n)*?node:\s*\[(?!26\])/.test(text)) {
            errors.push(`${path.posix.join('.github/workflows', file.relative)}: Node matrix must stay pinned to [26]`);
        }
        for (const match of text.matchAll(/\bpnpm\s+dlx\s+([^\s"']+)/g)) {
            const specifier = match[1];
            if (!hasExactPackageVersion(specifier)) {
                errors.push(`${path.posix.join('.github/workflows', file.relative)}: pnpm dlx tool must pin an exact version, got ${specifier}`);
            }
        }
        for (const match of text.matchAll(/\bgo\s+install\s+([^\s"']+)/g)) {
            const specifier = match[1];
            if (!/@v?\d+\.\d+\.\d+(?:$|\s)/.test(specifier)) {
                errors.push(`${path.posix.join('.github/workflows', file.relative)}: go install tool must pin an exact module version, got ${specifier}`);
            }
        }
        // eslint-disable-next-line security/detect-unsafe-regex -- Static policy scan over bounded workflow install command lines.
        for (const match of text.matchAll(/\bpip\s+install\s+(?:--user\s+)?([^\n]+)/g)) {
            for (const specifier of match[1].trim().split(/\s+/)) {
                if (specifier.startsWith('-')) {
                    continue;
                }
                if (!/==\d+\.\d+\.\d+/.test(specifier)) {
                    errors.push(`${path.posix.join('.github/workflows', file.relative)}: pip-installed tooling must pin exact versions, got ${specifier}`);
                }
            }
        }
    }
}

function parsePackageManagerVersion(packageManager) {
    const match = /^pnpm@(\d+\.\d+\.\d+)$/.exec(packageManager ?? '');
    return match?.[1];
}

function hasExactPackageVersion(specifier) {
    const atIndex = specifier.startsWith('@') ? specifier.indexOf('@', 1) : specifier.lastIndexOf('@');
    if (atIndex <= 0) {
        return false;
    }
    const version = specifier.slice(atIndex + 1);
    // eslint-disable-next-line security/detect-unsafe-regex -- Version suffix is a short package specifier token from package/workflow config.
    return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version);
}
