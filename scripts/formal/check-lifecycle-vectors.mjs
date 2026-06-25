import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { formatJsonFixture } from './json-format.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixturePath = path.join(rootDir, 'formal/fixtures/lifecycle-vectors.json');
const distIndexPath = path.join(rootDir, 'dist/index.js');
const prettierConfigPath = path.join(rootDir, '.config/shirika/formatters/prettier.json');
const generatedBy = 'scripts/formal/check-lifecycle-vectors.mjs --write';
const writeMode = process.argv.includes('--write');

const api = await import(pathToFileURL(distIndexPath).href).catch((error) => {
    throw new Error('Cannot import dist/index.js; run pnpm run build before checking lifecycle vectors.', { cause: error });
});

const fixture = buildFixture(api);
const expected = await formatJsonFixture(fixture, fixturePath, prettierConfigPath);

if (writeMode) {
    await mkdir(path.dirname(fixturePath), { recursive: true });
    await writeFile(fixturePath, expected);
} else {
    await assertFileEquals(fixturePath, expected);
}

function buildFixture(api) {
    const cancelVectors = [
        realizeCancelVector(api, {
            name: 'client-abort-cancel',
            purpose: 'CLIENT_ABORT maps to the abstract cancelled terminal class and AbortError reason',
            codeName: 'CLIENT_ABORT',
            code: api.CancelCode.CLIENT_ABORT,
            leanConstructor: 'Shirika.Lifecycle.CancelCode.clientAbort',
            leanTheorems: [
                'Shirika.Lifecycle.decodeCancelCode_cancelCodeValue',
                'Shirika.Lifecycle.classifyCancelCodeValue_cancelCodeValue',
                'Shirika.Lifecycle.clientAbort_value_classifies_cancelled',
            ],
            expectedTerminalClass: 'cancelled',
            reasonMessage: 'client aborted',
            expectedReasonName: 'AbortError',
        }),
        realizeCancelVector(api, {
            name: 'timeout-cancel',
            purpose: 'TIMEOUT maps to the abstract timedOut terminal class and ShirikaTimeoutError reason',
            codeName: 'TIMEOUT',
            code: api.CancelCode.TIMEOUT,
            leanConstructor: 'Shirika.Lifecycle.CancelCode.timeout',
            leanTheorems: [
                'Shirika.Lifecycle.decodeCancelCode_cancelCodeValue',
                'Shirika.Lifecycle.classifyCancelCodeValue_cancelCodeValue',
                'Shirika.Lifecycle.timeout_value_classifies_timedOut',
            ],
            expectedTerminalClass: 'timedOut',
            reasonMessage: 'deadline expired',
            expectedReasonName: 'ShirikaTimeoutError',
        }),
        realizeCancelVector(api, {
            name: 'client-close-cancel',
            purpose: 'CLIENT_CLOSE maps to the abstract cancelled terminal class and ShirikaClosedError reason',
            codeName: 'CLIENT_CLOSE',
            code: api.CancelCode.CLIENT_CLOSE,
            leanConstructor: 'Shirika.Lifecycle.CancelCode.clientClose',
            leanTheorems: [
                'Shirika.Lifecycle.decodeCancelCode_cancelCodeValue',
                'Shirika.Lifecycle.classifyCancelCodeValue_cancelCodeValue',
                'Shirika.Lifecycle.clientClose_value_classifies_cancelled',
            ],
            expectedTerminalClass: 'cancelled',
            reasonMessage: 'client closed',
            expectedReasonName: 'ShirikaClosedError',
        }),
    ];

    return {
        version: 2,
        sourceOfTruth: ['src/core/constants.ts', 'src/core/rpc/cancel.ts', 'src/core/rpc/pending.ts', 'formal/lean/Shirika/Lifecycle.lean'],
        generatedBy,
        leanBoundary:
            'finite cancel-code and pure pending-set membership facts only; real AbortSignal delivery, timers, scheduling, races, and worker lifecycle remain runtime-test boundaries',
        cancelVectors,
        pendingWitnessVectors: realizePendingWitnessVectors(),
        outOfModelRuntimeFallback: realizeUnknownCodeFallback(api),
    };
}

function realizePendingWitnessVectors() {
    return [
        {
            name: 'allocated-fresh-request-id',
            purpose: 'locally allocated request ids are nonzero and not already pending before insertion',
            abstractOperation: 'allocateRequestId before insertAllocated',
            runtimeCoverage: ['test/node/pending-witness.test.ts allocation returns non-zero UInt32 ids and skips ids already pending'],
            leanTheorems: ['Shirika.Lifecycle.PendingSet.allocatedFresh_not_pending', 'Shirika.Lifecycle.PendingSet.allocatedFresh_nonzero'],
        },
        {
            name: 'insert-after-allocation-establishes-witness',
            purpose: 'PendingRequestId witness exists only after the allocated id has been inserted into the pending set',
            abstractOperation: 'insertAllocated creates PendingRequestId after map insertion',
            runtimeCoverage: ['test/node/pending-witness.test.ts witness is created only for an inserted pending entry'],
            leanTheorems: ['Shirika.Lifecycle.PendingSet.insert_after_allocation_establishes_witness'],
        },
        {
            name: 'release-known-pending-removes-one-entry',
            purpose: 'witness release removes the matching pending entry and leaves other ids unchanged in the abstract model',
            abstractOperation: 'releaseByWitness consumes a locally owned pending request witness',
            runtimeCoverage: ['test/node/pending-witness.test.ts releaseByWitness consumes the pending entry exactly once'],
            leanTheorems: ['Shirika.Lifecycle.PendingSet.release_known_pending_removes_exactly_one'],
        },
        {
            name: 'duplicate-release-idempotent',
            purpose: 'a repeated release of the same abstract request id has no second terminal effect',
            abstractOperation: 'releaseByWitness after release returns undefined',
            runtimeCoverage: ['test/node/pending-witness.test.ts stale witness cannot release a new entry that reused the numeric id'],
            leanTheorems: ['Shirika.Lifecycle.PendingSet.release_idempotent', 'Shirika.Lifecycle.pending_terminal_exactly_once'],
        },
    ];
}

function realizeCancelVector(api, spec) {
    assertIntegerCode(spec.name, spec.code);
    const emptyReasonPayload = normalizeCancelPayload(api.createCancelPayload(spec.code, undefined));
    const messagePayload = normalizeCancelPayload(api.createCancelPayload(spec.code, new Error(spec.reasonMessage)));
    const reason = api.createCancelReason(messagePayload);
    assertReasonShape(api, spec, reason);
    return {
        name: spec.name,
        purpose: spec.purpose,
        codeName: spec.codeName,
        code: spec.code,
        leanConstructor: spec.leanConstructor,
        leanTheorems: spec.leanTheorems,
        expectedTerminalClass: spec.expectedTerminalClass,
        emptyReasonPayload,
        messagePayload,
        reason: normalizeReason(reason),
    };
}

function realizeUnknownCodeFallback(api) {
    const code = 255;
    const payload = normalizeCancelPayload(api.createCancelPayload(code, new Error('unknown cancellation')));
    const reason = api.createCancelReason(payload);
    if (!(reason instanceof Error) || reason.name !== 'AbortError' || reason.message !== 'unknown cancellation') {
        throw new Error(`unknown cancel-code fallback mismatch: ${stableJson(normalizeReason(reason))}`);
    }
    return {
        name: 'unknown-cancel-code-runtime-fallback',
        purpose: 'unknown runtime cancel codes fall back to AbortError but remain outside the finite Lean CancelCode model',
        code,
        leanBoundary: 'not decoded by Shirika.Lifecycle.decodeCancelCode',
        payload,
        reason: normalizeReason(reason),
    };
}

function normalizeCancelPayload(payload) {
    return {
        code: payload.code,
        message: payload.message ?? null,
    };
}

function normalizeReason(reason) {
    if (!(reason instanceof Error)) {
        throw new TypeError(`cancel reason is not an Error: ${String(reason)}`);
    }
    return {
        name: reason.name,
        message: reason.message,
    };
}

function assertReasonShape(api, spec, reason) {
    if (spec.expectedReasonName === 'ShirikaTimeoutError') {
        if (!(reason instanceof api.ShirikaTimeoutError)) {
            throw new Error(`${spec.name} expected ShirikaTimeoutError, got ${stableJson(normalizeReason(reason))}`);
        }
    } else if (spec.expectedReasonName === 'ShirikaClosedError') {
        if (!(reason instanceof api.ShirikaClosedError)) {
            throw new Error(`${spec.name} expected ShirikaClosedError, got ${stableJson(normalizeReason(reason))}`);
        }
    } else if (spec.expectedReasonName === 'AbortError') {
        if (!(reason instanceof Error) || reason.name !== 'AbortError') {
            throw new Error(`${spec.name} expected AbortError, got ${stableJson(normalizeReason(reason))}`);
        }
    } else {
        throw new Error(`${spec.name} has unknown expected reason ${spec.expectedReasonName}`);
    }
    if (reason.message !== spec.reasonMessage) {
        throw new Error(`${spec.name} reason message mismatch: ${reason.message}`);
    }
}

function assertIntegerCode(name, code) {
    if (!Number.isInteger(code) || code < 0 || code > 0xff) {
        throw new Error(`${name} cancel code must fit the u8 cancel payload codec; got ${code}`);
    }
}

function stableJson(value) {
    return JSON.stringify(value, null, 2);
}

async function assertFileEquals(filePath, expected) {
    let actual;
    try {
        actual = await readFile(filePath, 'utf8');
    } catch (error) {
        throw new Error(`${path.relative(rootDir, filePath)} is missing; run pnpm run formal:lifecycle:update`, { cause: error });
    }
    if (actual !== expected) {
        throw new Error(`${path.relative(rootDir, filePath)} is stale; run pnpm run formal:lifecycle:update`);
    }
}
