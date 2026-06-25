import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readUtf8, reportErrors, walkFiles } from './lib-checks.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const errors = [];
const allowedConsoleFiles = [/^scripts\//, /^bench\//, /^demo\//, /^test\//, /^shared\//, /^\.config\/shirika\/(?:build|test)\//];
const allowedProcessExitFiles = [/^scripts\//];
const publicEntrypoints = new Set(['src/index.ts', 'src/browser.ts', 'src/node.ts', 'src/worker-browser.ts', 'src/worker-node.ts']);
const bannedPatterns = [
    { pattern: /\beval\s*\(/, message: 'eval() is forbidden' },
    { pattern: /\bnew\s+Function\s*\(/, message: 'new Function() is forbidden' },
    { pattern: /\bdocument\.write\s*\(/, message: 'document.write() is forbidden' },
    { pattern: /\.innerHTML\s*=/, message: 'innerHTML assignment is forbidden' },
    { pattern: /\bdebugger\s*;/, message: 'debugger statements are forbidden' },
    { pattern: /\bTODO\b|\bFIXME\b/, message: 'TODO/FIXME markers must be tracked outside source' },
    { pattern: /@ts-ignore(?!: [A-Z].{11,})/, message: '@ts-ignore requires a specific description or must be avoided' },
    { pattern: /from\s+['"](?:\.\.\/)*dist\//, message: 'src files must not import built dist artifacts', appliesTo: /^src\// },
    {
        pattern: /from\s+['"]shirika-rpc(?:\/|['"])/,
        message: 'package self-imports are only allowed in package smoke and tsd tests',
        appliesTo: /^(src|bench|demo|shared)\//,
    },
];

const approvedBrandCastFiles = new Map([
    ['src/core/rpc/contract.ts', [/\bas\s+MethodId\b/, /\bas\s+PreparedContract</]],
    ['src/core/rpc/pending.ts', [/\bas\s+PendingRequestId\b/, /\bas\s+MutablePendingRequestWitness</]],
    ['src/core/ring/endpoint.ts', [/\bas\s+ValidatedFrameHeader\b/, /\bas\s+ValidatedFrame\b/, /\bas\s+ValidatedAlignedBytesPayloadRange\b/]],
    ['src/core/codec/witness.ts', [/\bas\s+BinaryCodec<unknown>/, /\bas\s+PreparedBinaryCodec</]],
    ['src/core/codec/combinators.ts', [/\bas\s+PreparedBinaryCodec<unknown>\[\]/]],
]);

const files = await walkFiles(rootDir, {
    include: (relative) => /\.(?:cjs|cts|js|jsx|mjs|mts|ts|tsx|html)$/.test(relative),
    exclude: (relative) => relative.endsWith('.d.ts') || relative.endsWith('.d.mts'),
});

for (const file of files) {
    const text = await readUtf8(file.absolute);
    const lines = text.split('\n');
    for (const [index, line] of lines.entries()) {
        const lineNumber = index + 1;
        const isPolicyScript = file.relative === 'scripts/quality/check-source-policy.mjs' || file.relative === 'scripts/quality/check-markdown.mjs';
        if (!isPolicyScript) {
            for (const rule of bannedPatterns) {
                if ((rule.appliesTo === undefined || rule.appliesTo.test(file.relative)) && rule.pattern.test(line)) {
                    errors.push(`${file.relative}:${lineNumber}: ${rule.message}`);
                }
            }
        }
        if (
            /\bconsole\./.test(line) &&
            !allowedConsoleFiles.some((pattern) => pattern.test(file.relative)) &&
            !isAllowedRuntimeDiagnostic(file.relative, line)
        ) {
            errors.push(
                `${file.relative}:${lineNumber}: console usage is forbidden outside scripts/bench/demo/test/shared unless it is a namespaced runtime diagnostic`,
            );
        }
        if (/\bprocess\.exit\s*\(/.test(line) && !allowedProcessExitFiles.some((pattern) => pattern.test(file.relative))) {
            errors.push(`${file.relative}:${lineNumber}: process.exit() is only allowed in repository scripts`);
        }
        if (/postMessage\s*\([^,]+,\s*['"]\*['"]/.test(line)) {
            errors.push(`${file.relative}:${lineNumber}: wildcard postMessage target is forbidden`);
        }
        if (file.relative.startsWith('src/') && /\ballocUnsafe\s*\(/.test(line) && !hasSafetyComment(lines, index)) {
            errors.push(`${file.relative}:${lineNumber}: unsafe allocation must have a nearby SAFETY comment explaining the overwrite invariant`);
        }
        if (file.relative.startsWith('src/') && /\bas unknown as\b/.test(line) && !hasSafetyComment(lines, index)) {
            errors.push(`${file.relative}:${lineNumber}: as unknown as casts require a nearby SAFETY comment and approved internal scope`);
        }
        if (
            file.relative.startsWith('src/') &&
            /\bas\s+(?:PreparedContract|MethodId|ValidatedFrame|ValidatedFrameHeader|ValidatedAlignedBytesPayloadRange|PendingRequestId|MutablePendingRequestWitness|PreparedBinaryCodec)/.test(
                line,
            )
        ) {
            const approvals = approvedBrandCastFiles.get(file.relative) ?? [];
            if (!approvals.some((pattern) => pattern.test(line))) {
                errors.push(`${file.relative}:${lineNumber}: brand casts are allowed only inside witness constructors or approved cache recovery code`);
            }
        }
        if (
            file.relative.startsWith('src/') &&
            /\b(?:preparedContractBrand|preparedBinaryCodecBrand|codecWitnessBrand|validatedEncodedPayloadBrand|contractWitnessBrand)\s+in\s+/.test(line)
        ) {
            errors.push(
                `${file.relative}:${lineNumber}: symbol brands must not be used as runtime witness authority; use module-private WeakMap/WeakSet validation`,
            );
        }
        if (file.relative.startsWith('src/') && hasProductionNonNullAssertion(line)) {
            errors.push(`${file.relative}:${lineNumber}: non-null assertions are forbidden in production source; use an assertion or witness constructor`);
        }
        if (file.relative.startsWith('src/') && hasUnsafeFunctionDeclaration(line) && !hasUnsafeDocComment(lines, index)) {
            errors.push(`${file.relative}:${lineNumber}: unsafe helper must have a TSDoc block with UNSAFE and Safety precondition sections`);
        }
        if (publicEntrypoints.has(file.relative) && /\bunsafe[A-Z0-9_]/.test(line)) {
            errors.push(`${file.relative}:${lineNumber}: public entrypoints must not export unsafe helpers`);
        }
        if (publicEntrypoints.has(file.relative) && /fast-path-strategy/.test(line)) {
            errors.push(`${file.relative}:${lineNumber}: fast-path strategy is internal and must not be exported from public entrypoints`);
        }
        if (/(?:\/\/|\/\*).*\b(?:eslint-disable|biome-ignore|oxlint-disable)\b/.test(line) && !/--|reason|Reason|SAFETY:/.test(line)) {
            errors.push(`${file.relative}:${lineNumber}: lint suppressions require an inline reason`);
        }
    }
}

reportErrors('Source safety policy check', errors);

function hasSafetyComment(lines, index) {
    return nearbyComment(lines, index, 5).some((comment) => /SAFETY:|Safety precondition:|UNSAFE:/.test(comment));
}

function hasUnsafeDocComment(lines, index) {
    const comments = nearbyComment(lines, index, 12).join('\n');
    return /UNSAFE:/.test(comments) && /Safety precondition:/.test(comments);
}

function nearbyComment(lines, index, distance) {
    const comments = [];
    for (let current = Math.max(0, index - distance); current < index; current += 1) {
        const trimmed = lines[current].trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/**') || trimmed.startsWith('*/')) {
            comments.push(trimmed);
        }
    }
    return comments;
}

function hasProductionNonNullAssertion(line) {
    const stripped = line.replaceAll(/(['"`])(?:\\.|(?!\1).)*\1/gu, '');
    return /(?:\b[$A-Z_a-z][$\w]*|\]|\))!\s*(?:\.|\[|\(|;|,|\]|\})/u.test(stripped) && !/!==|!=|!\s*=/.test(stripped);
}

function hasUnsafeFunctionDeclaration(line) {
    const declarationIndex = line.indexOf('function unsafe');
    if (declarationIndex === -1) {
        return false;
    }
    const prefix = line.slice(0, declarationIndex).trim();
    return prefix === '' || prefix === 'export';
}

function isAllowedRuntimeDiagnostic(relativePath, line) {
    return relativePath.startsWith('src/') && /console\.error\(.*\[shirika-rpc\]/.test(line);
}
