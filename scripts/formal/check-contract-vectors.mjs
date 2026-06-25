import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { formatJsonFixture } from './json-format.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixturePath = path.join(rootDir, 'formal/fixtures/contract-hash-vectors.json');
const distIndexPath = path.join(rootDir, 'dist/index.js');
const prettierConfigPath = path.join(rootDir, '.config/shirika/formatters/prettier.json');
const generatedBy = 'scripts/formal/check-contract-vectors.mjs --write';
const writeMode = process.argv.includes('--write');

const api = await import(pathToFileURL(distIndexPath).href).catch((error) => {
    throw new Error('Cannot import dist/index.js; run pnpm run build before checking contract vectors.', { cause: error });
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
    const validVectors = [
        realizeValidVector(api, 'single-method-contract', 'single method description and JSON/FNV hash input', singleMethodContract(api)),
        realizeOrderInvariantVector(api),
        realizeValidVector(
            api,
            'uint32-boundary-method-id',
            'boundary method id 0xffffffff is accepted and serialized without truncation',
            boundaryContract(api),
        ),
        realizeValidVector(api, 'representative-nested-method', 'nested realistic codec signature appears in the canonical hash input', realisticContract(api)),
    ];
    const invalidVectors = [realizeDuplicateIdInvalid(api), realizeZeroMethodIdInvalid(api), realizeAboveUInt32Invalid(api)];
    return {
        version: 1,
        sourceOfTruth: ['src/core/rpc/contract.ts', 'src/core/codec/signature.ts', 'formal/lean/Shirika/Contract.lean'],
        generatedBy,
        hashInput:
            'PreparedContract.descriptionJson, equivalent to JSON.stringify(describeContract(contract)); entries sorted by numeric id, then UTF-16 code-unit method name order',
        methodIdPolicy:
            'runtime rejects contract method ids outside 1..0xffffffff during contract preparation; frame-level method ids are UInt32 and reject outside 0..0xffffffff',
        validVectors,
        invalidVectors,
    };
}

function singleMethodContract({ codecs, defineContract, method }) {
    return defineContract({
        echo: method(1, codecs.string(), codecs.string()),
    });
}

function multiMethodContractOrderA({ codecs, defineContract, method }) {
    const nestedRequest = nestedRequestCodec(codecs);
    const nestedResponse = nestedResponseCodec(codecs);
    return defineContract({
        processNested: method(7, nestedRequest, nestedResponse),
        echo: method(1, codecs.string(), codecs.string()),
        sum: method(2, codecs.tuple([codecs.u32(), codecs.u32()]), codecs.u32()),
    });
}

function multiMethodContractOrderB({ codecs, defineContract, method }) {
    const nestedRequest = nestedRequestCodec(codecs);
    const nestedResponse = nestedResponseCodec(codecs);
    return defineContract({
        sum: method(2, codecs.tuple([codecs.u32(), codecs.u32()]), codecs.u32()),
        processNested: method(7, nestedRequest, nestedResponse),
        echo: method(1, codecs.string(), codecs.string()),
    });
}

function boundaryContract({ codecs, defineContract, method, MAX_METHOD_ID }) {
    return defineContract({
        maxMethod: method(MAX_METHOD_ID, codecs.void(), codecs.void()),
    });
}

function realisticContract({ codecs, defineContract, method }) {
    return defineContract({
        processNested: method(7, nestedRequestCodec(codecs), nestedResponseCodec(codecs)),
    });
}

function nestedRequestCodec(codecs) {
    return codecs.struct({
        tag: codecs.u8(),
        maybePayload: codecs.optional(codecs.bytes()),
        pairs: codecs.array(codecs.tuple([codecs.bool(), codecs.u8()])),
    });
}

function nestedResponseCodec(codecs) {
    return codecs.tuple([codecs.bool(), codecs.u16()]);
}

function realizeValidVector(api, name, purpose, contract) {
    const description = api.describeContract(contract);
    const descriptionJson = JSON.stringify(description);
    const hash = api.getContractHash(contract);
    const prepared = api.prepareContract(contract);
    const preparedAgain = api.prepareContract(prepared);
    const expectedHash = fnv1a32String(descriptionJson);
    if (hash !== expectedHash) {
        throw new Error(`${name} hash mismatch: runtime=${hash}, independent=${expectedHash}`);
    }
    if (preparedAgain !== prepared) {
        throw new Error(`${name} prepared witness was not reused by prepareContract(prepared)`);
    }
    if (prepared.descriptionJson !== descriptionJson || prepared.hash !== hash) {
        throw new Error(`${name} prepared description/hash diverged from public helpers`);
    }
    if (!isDeepStrictEqual(api.describeContract(prepared), description)) {
        throw new Error(`${name} prepared description copy diverged from public description`);
    }
    return {
        name,
        purpose,
        description,
        descriptionJson,
        hash,
        methodIds: description.map((entry) => entry.id),
        preparedWitness: {
            descriptionJson: prepared.descriptionJson,
            hash: prepared.hash,
            reprepareReturnsSameWitness: preparedAgain === prepared,
            methodIndexLookups: description.map((entry) => {
                const indexEntry = prepared.methodIndex.get(entry.id);
                if (!indexEntry) {
                    throw new Error(`${name} missing prepared method index entry for id ${entry.id}`);
                }
                return { id: entry.id, method: indexEntry.method };
            }),
            methodNameLookups: description.map((entry) => {
                const nameEntry = prepared.methodsByName.get(entry.method);
                if (!nameEntry) {
                    throw new Error(`${name} missing prepared method-name entry for ${entry.method}`);
                }
                return { method: entry.method, id: nameEntry.id };
            }),
        },
    };
}

function realizeOrderInvariantVector(api) {
    const first = realizeValidVector(
        api,
        'multiple-methods-order-a',
        'multiple methods declared in processNested/echo/sum insertion order',
        multiMethodContractOrderA(api),
    );
    const second = realizeValidVector(
        api,
        'multiple-methods-order-b',
        'same methods declared in sum/processNested/echo insertion order',
        multiMethodContractOrderB(api),
    );
    if (!isDeepStrictEqual(first.description, second.description)) {
        throw new Error('canonical descriptions differ for insertion-order variants');
    }
    if (first.hash !== second.hash || first.descriptionJson !== second.descriptionJson) {
        throw new Error('canonical hash input differs for insertion-order variants');
    }
    return {
        name: 'multiple-methods-different-insertion-orders',
        purpose: 'same canonical description and hash from different object insertion orders',
        description: first.description,
        descriptionJson: first.descriptionJson,
        hash: first.hash,
        alternateInsertionOrderDescriptionJson: second.descriptionJson,
        alternateInsertionOrderHash: second.hash,
        methodIds: first.methodIds,
        preparedWitness: first.preparedWitness,
        alternateInsertionOrderPreparedWitness: second.preparedWitness,
    };
}

function realizeDuplicateIdInvalid({ buildMethodIndex, codecs, defineContract, describeContract, getContractHash, method, prepareContract }) {
    const contract = {
        first: method(1, codecs.string(), codecs.string()),
        second: method(1, codecs.string(), codecs.string()),
    };
    return {
        name: 'duplicate-method-id-invalid',
        purpose: 'duplicate ids are invalid for contract definition, description, hash, method index, and preparation',
        outcomes: [
            captureThrow('defineContract', () => defineContract(contract)),
            captureThrow('describeContract', () => describeContract(contract)),
            captureThrow('getContractHash', () => getContractHash(contract)),
            captureThrow('buildMethodIndex', () => buildMethodIndex(contract)),
            captureThrow('prepareContract', () => prepareContract(contract)),
        ],
    };
}

function realizeZeroMethodIdInvalid({ buildMethodIndex, codecs, defineContract, describeContract, getContractHash, prepareContract }) {
    const unchecked = {
        zero: {
            id: 0,
            request: codecs.void(),
            response: codecs.void(),
        },
    };
    return {
        name: 'method-id-zero-invalid',
        purpose: 'contract method ids are positive and reject 0 at every preparation/description/index/hash boundary',
        outcomes: [
            captureThrow('defineContractUnchecked', () => defineContract(unchecked)),
            captureThrow('describeContractUnchecked', () => describeContract(unchecked)),
            captureThrow('getContractHashUnchecked', () => getContractHash(unchecked)),
            captureThrow('buildMethodIndexUnchecked', () => buildMethodIndex(unchecked)),
            captureThrow('prepareContractUnchecked', () => prepareContract(unchecked)),
        ],
    };
}

function realizeAboveUInt32Invalid({ buildMethodIndex, codecs, defineContract, describeContract, getContractHash, method, prepareContract, MAX_METHOD_ID }) {
    const unchecked = {
        tooLarge: {
            id: MAX_METHOD_ID + 1,
            request: codecs.void(),
            response: codecs.void(),
        },
    };
    return {
        name: 'method-id-above-uint32-invalid',
        purpose: 'ids above 0xffffffff are rejected instead of truncated or hashed',
        outcomes: [
            captureThrow('method', () => method(MAX_METHOD_ID + 1, codecs.void(), codecs.void())),
            captureThrow('defineContractUnchecked', () => defineContract(unchecked)),
            captureThrow('describeContractUnchecked', () => describeContract(unchecked)),
            captureThrow('getContractHashUnchecked', () => getContractHash(unchecked)),
            captureThrow('buildMethodIndexUnchecked', () => buildMethodIndex(unchecked)),
            captureThrow('prepareContractUnchecked', () => prepareContract(unchecked)),
        ],
    };
}

function captureThrow(operation, run) {
    try {
        run();
    } catch (error) {
        if (!(error instanceof Error)) {
            throw new TypeError(`${operation} threw a non-Error value`, { cause: error });
        }
        return {
            operation,
            errorName: error.name,
            message: error.message,
        };
    }
    throw new Error(`${operation} did not throw`);
}

function fnv1a32String(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}

async function assertFileEquals(filePath, expected) {
    let actual;
    try {
        actual = await readFile(filePath, 'utf8');
    } catch (error) {
        throw new Error(`${path.relative(rootDir, filePath)} is missing; run pnpm run formal:contract:update`, { cause: error });
    }
    if (actual !== expected) {
        throw new Error(`${path.relative(rootDir, filePath)} is stale; run pnpm run formal:contract:update`);
    }
}
