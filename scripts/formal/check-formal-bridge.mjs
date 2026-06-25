import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatJsonFixture } from './json-format.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const constantsPath = path.join(rootDir, 'src/core/constants.ts');
const endpointPath = path.join(rootDir, 'src/core/ring/endpoint.ts');
const leanFramePath = path.join(rootDir, 'formal/lean/Shirika/Frame.lean');
const constantsFixturePath = path.join(rootDir, 'formal/fixtures/constants.json');
const frameFixturePath = path.join(rootDir, 'formal/fixtures/frame-layout-golden.json');
const leanConstantsPath = path.join(rootDir, 'formal/lean/Shirika/Generated/Constants.lean');
const prettierConfigPath = path.join(rootDir, '.config/shirika/formatters/prettier.json');
const generatedBy = 'scripts/formal/check-formal-bridge.mjs --write';
const writeMode = process.argv.includes('--write');

const constantsSource = await readFile(constantsPath, 'utf8');
const endpointSource = await readFile(endpointPath, 'utf8');
const leanFrameSource = await readFile(leanFramePath, 'utf8');
const extracted = extractConstants(constantsSource);
const writeLayout = extractTsHeaderWriteLayout(endpointSource);
const readLayout = extractTsHeaderReadLayout(endpointSource);
const leanLayout = extractLeanHeaderByteLayout(leanFrameSource);
const alignedBytesPayloadFlag = extractEndpointNumericConstant(endpointSource, 'FRAME_FLAG_ALIGNED_BYTES_PAYLOAD');

assertSameLayout(writeLayout, readLayout, 'TypeScript writeFrameHeader/readFrameHeader');
assertSameLayout(writeLayout, leanLayout, 'TypeScript frame header layout / Lean encodeHeader byte order');

const constantsFixture = createConstantsFixture(extracted);
const frameFixture = createFrameFixture(extracted, writeLayout, alignedBytesPayloadFlag);
const leanConstants = createLeanConstantsModule(extracted);
const constantsFixtureText = await formatJsonFixture(constantsFixture, constantsFixturePath, prettierConfigPath);
const frameFixtureText = await formatJsonFixture(frameFixture, frameFixturePath, prettierConfigPath);

if (writeMode) {
    await mkdir(path.dirname(constantsFixturePath), { recursive: true });
    await mkdir(path.dirname(leanConstantsPath), { recursive: true });
    await writeFile(constantsFixturePath, constantsFixtureText);
    await writeFile(frameFixturePath, frameFixtureText);
    await writeFile(leanConstantsPath, leanConstants);
} else {
    await assertFileEquals(constantsFixturePath, constantsFixtureText);
    await assertFileEquals(frameFixturePath, frameFixtureText);
    await assertFileEquals(leanConstantsPath, leanConstants);
}

function extractEndpointNumericConstant(source, name) {
    const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
    const pattern = new RegExp(`^const ${escaped} = ([^;]+);$`, 'm');
    const match = source.match(pattern);
    if (!match) {
        throw new Error(`Cannot find endpoint constant ${name}`);
    }
    return evaluateNumericExpression(match[1], new Map());
}

function extractConstants(source) {
    const constants = new Map();
    for (const match of source.matchAll(/^export const ([A-Z0-9_]+) = ([^;]+);$/gm)) {
        const [, name, expression] = match;
        constants.set(name, evaluateNumericExpression(expression, constants));
    }
    const enums = new Map();
    for (const match of source.matchAll(/^export enum ([A-Za-z0-9_]+) \{([\s\S]*?)^\}/gm)) {
        const [, enumName, body] = match;
        const members = new Map();
        let nextValue = 0;
        for (const rawLine of body.split('\n')) {
            const line = rawLine.trim().replace(/,$/, '');
            if (!line) {
                continue;
            }
            const equalsIndex = line.indexOf('=');
            const memberName = (equalsIndex === -1 ? line : line.slice(0, equalsIndex)).trim();
            const expression = equalsIndex === -1 ? undefined : line.slice(equalsIndex + 1).trim();
            if (!/^[A-Z0-9_]+$/.test(memberName) || expression === '') {
                throw new Error(`Cannot parse enum member in ${enumName}: ${line}`);
            }
            const value = expression === undefined ? nextValue : evaluateNumericExpression(expression, new Map([...constants, ...members]));
            members.set(memberName, value);
            nextValue = value + 1;
        }
        enums.set(enumName, members);
    }
    return { constants, enums };
}

function evaluateNumericExpression(expression, scope) {
    const substituted = expression.replaceAll(/\b[A-Z][A-Z0-9_]*\b/g, (identifier) => {
        const value = scope.get(identifier);
        if (value === undefined) {
            throw new Error(`Unknown identifier ${identifier} in constants expression ${expression}`);
        }
        return String(value);
    });
    const tokens = tokenizeNumericExpression(substituted);
    let index = 0;
    const value = parseShift();
    if (index !== tokens.length) {
        throw new Error(`Unexpected token ${tokens[index]} in constants expression ${expression}`);
    }
    return value;

    function parseShift() {
        let left = parseAdditive();
        while (tokens[index] === '<<') {
            index += 1;
            left <<= parseAdditive();
        }
        return left;
    }

    function parseAdditive() {
        let left = parseMultiplicative();
        while (tokens[index] === '+' || tokens[index] === '-') {
            const operator = tokens[index];
            index += 1;
            const right = parseMultiplicative();
            left = operator === '+' ? left + right : left - right;
        }
        return left;
    }

    function parseMultiplicative() {
        let left = parsePrimary();
        while (tokens[index] === '*') {
            index += 1;
            left *= parsePrimary();
        }
        return left;
    }

    function parsePrimary() {
        const token = tokens[index];
        if (token === undefined) {
            throw new Error(`Unexpected end of constants expression ${expression}`);
        }
        if (token === '(') {
            index += 1;
            const value = parseShift();
            if (tokens[index] !== ')') {
                throw new Error(`Unclosed parenthesis in constants expression ${expression}`);
            }
            index += 1;
            return value;
        }
        if (/^(?:0x[0-9a-f]+|\d+)$/i.test(token)) {
            index += 1;
            return Number.parseInt(token, token.toLowerCase().startsWith('0x') ? 16 : 10);
        }
        throw new Error(`Unexpected token ${token} in constants expression ${expression}`);
    }
}

function tokenizeNumericExpression(expression) {
    const tokens = [];
    let index = 0;
    while (index < expression.length) {
        const character = expression[index];
        if (/\s/.test(character)) {
            index += 1;
            continue;
        }
        if (expression.startsWith('<<', index)) {
            tokens.push('<<');
            index += 2;
            continue;
        }
        if (character === '+' || character === '-' || character === '*' || character === '(' || character === ')') {
            tokens.push(character);
            index += 1;
            continue;
        }
        const number = expression.slice(index).match(/^(?:0x[0-9a-f]+|\d+)/i);
        if (number) {
            tokens.push(number[0]);
            index += number[0].length;
            continue;
        }
        throw new Error(`Unsupported constants expression token near ${expression.slice(index)}`);
    }
    return tokens;
}

function extractTsHeaderWriteLayout(source) {
    const layout = [];
    const pattern = /view\.set(Uint32|Uint16|Int32)\((\d+), header\.([A-Za-z0-9_]+), true\);/g;
    for (const match of source.matchAll(pattern)) {
        const [, accessor, offsetText, field] = match;
        layout.push(layoutEntry(field, Number(offsetText), accessor));
    }
    return layout.sort((left, right) => left.offset - right.offset);
}

function extractTsHeaderReadLayout(source) {
    const start = source.indexOf('function readHeaderView');
    const end = source.indexOf('function validateFrameHeader', start);
    if (start < 0 || end < 0) {
        throw new Error('Cannot find TypeScript readHeaderView block');
    }
    const block = source.slice(start, end);
    const layout = [];
    const pattern = /([A-Za-z0-9_]+): view\.get(Uint32|Uint16|Int32)\((\d+), true\)/g;
    for (const match of block.matchAll(pattern)) {
        const [, field, accessor, offsetText] = match;
        layout.push(layoutEntry(field, Number(offsetText), accessor));
    }
    return layout.sort((left, right) => left.offset - right.offset);
}

function extractLeanHeaderByteLayout(source) {
    const start = source.indexOf('def encodeHeader');
    const end = source.indexOf('def decodeHeader', start);
    if (start < 0 || end < 0) {
        throw new Error('Cannot find Lean encodeHeader block');
    }
    const block = source.slice(start, end);
    const byteRefs = [...block.matchAll(/h\.([A-Za-z0-9_]+)\.b(\d)/g)].map((match, index) => ({ field: match[1], byteIndex: Number(match[2]), offset: index }));
    const grouped = new Map();
    for (const ref of byteRefs) {
        if (!grouped.has(ref.field)) {
            grouped.set(ref.field, []);
        }
        grouped.get(ref.field).push(ref);
    }
    return [...grouped.entries()]
        .map(([field, refs]) => {
            const offsets = refs.map((ref) => ref.offset).sort((left, right) => left - right);
            const byteIndexes = refs.map((ref) => ref.byteIndex).sort((left, right) => left - right);
            for (let index = 0; index < offsets.length; index += 1) {
                if (offsets[index] !== offsets[0] + index || byteIndexes[index] !== index) {
                    throw new Error(`Lean encodeHeader has non-contiguous bytes for ${field}`);
                }
            }
            const accessor = offsets.length === 2 ? 'Uint16' : field === 'statusCode' ? 'Int32' : 'Uint32';
            return layoutEntry(field, offsets[0], accessor);
        })
        .sort((left, right) => left.offset - right.offset);
}

function layoutEntry(field, offset, accessor) {
    const width = accessor === 'Uint16' ? 2 : 4;
    const signed = accessor === 'Int32';
    return {
        field,
        offset,
        width,
        accessor,
        type: signed ? 'int32' : `uint${width * 8}`,
        endian: 'little',
    };
}

function assertSameLayout(left, right, label) {
    if (JSON.stringify(left) !== JSON.stringify(right)) {
        throw new Error(`${label} diverged:\nleft=${JSON.stringify(left)}\nright=${JSON.stringify(right)}`);
    }
}

function createConstantsFixture({ constants, enums }) {
    const controlI32Count = requiredConst(constants, 'CONTROL_I32_COUNT');
    const headerSize = requiredConst(constants, 'HEADER_SIZE');
    const minCapacityBytes = requiredConst(constants, 'MIN_CAPACITY_BYTES');
    const maxCapacityBytes = requiredConst(constants, 'MAX_CAPACITY_BYTES');
    const uint32Max = requiredConst(constants, 'UINT32_MAX');
    const maxMethodId = requiredConst(constants, 'MAX_METHOD_ID');
    return {
        version: 1,
        sourceOfTruth: ['src/core/constants.ts'],
        generatedBy,
        leanGeneratedMirror: 'formal/lean/Shirika/Generated/Constants.lean',
        constants: [
            constantRecord(
                'CONTROL_I32_COUNT',
                controlI32Count,
                'Nat',
                'Shirika.Generated.Constants.controlI32Count',
                'control Int32 slots before the ring data region',
            ),
            constantRecord(
                'DEFAULT_CAPACITY_BYTES',
                requiredConst(constants, 'DEFAULT_CAPACITY_BYTES'),
                'Nat',
                'Shirika.Generated.Constants.defaultCapacityBytes',
                'default data-region capacity',
            ),
            constantRecord('HEADER_SIZE', headerSize, 'Nat', 'Shirika.Generated.Constants.headerSize', 'frame header byte length'),
            constantRecord(
                'MIN_CAPACITY_BYTES',
                minCapacityBytes,
                'Nat',
                'Shirika.Generated.Constants.minCapacityBytes',
                'minimum supported ring data-region capacity',
            ),
            constantRecord(
                'MAX_CAPACITY_BYTES',
                maxCapacityBytes,
                'Nat',
                'Shirika.Generated.Constants.maxCapacityBytes',
                'maximum supported ring data-region capacity',
            ),
            constantRecord('FRAME_MAGIC', requiredConst(constants, 'FRAME_MAGIC'), 'UInt32', 'Shirika.Generated.Constants.frameMagic', 'wire frame magic'),
            constantRecord(
                'FRAME_VERSION',
                requiredConst(constants, 'FRAME_VERSION'),
                'UInt16',
                'Shirika.Generated.Constants.frameVersion',
                'wire frame version',
            ),
            constantRecord(
                'NORMALIZE_THRESHOLD',
                requiredConst(constants, 'NORMALIZE_THRESHOLD'),
                'Nat',
                'Shirika.Generated.Constants.normalizeThreshold',
                'empty-ring sequence normalization threshold',
            ),
            constantRecord('UINT32_MAX', uint32Max, 'UInt32', 'Shirika.Generated.Constants.uint32Max', 'maximum DataView/Atomics UInt32 field value'),
            constantRecord('MAX_METHOD_ID', maxMethodId, 'UInt32', 'Shirika.Generated.Constants.maxMethodId', 'maximum contract method id'),
        ],
        enums: Object.fromEntries(
            [...enums.entries()].map(([enumName, members]) => [enumName, [...members.entries()].map(([member, value]) => enumRecord(enumName, member, value))]),
        ),
        bounds: {
            capacityBytes: {
                minimum: minCapacityBytes,
                maximum: maxCapacityBytes,
                powerOfTwo: true,
                controlByteLength: controlI32Count * Int32Array.BYTES_PER_ELEMENT,
                totalByteLengthLaw: 'controlByteLength + capacityBytes',
                sourceOfTruth: ['src/core/constants.ts', 'src/core/ring/layout.ts'],
            },
            frameSizeBytes: {
                minimum: headerSize,
                maximum: 'capacityBytes',
                maximumPayloadLengthLaw: 'capacityBytes - HEADER_SIZE',
                alignmentBytes: 8,
                paddingRangeInclusive: [0, 7],
                sourceOfTruth: ['src/core/ring/endpoint.ts', 'src/core/utils.ts'],
            },
            methodId: {
                wireMinimum: 0,
                contractMinimum: 1,
                maximum: maxMethodId,
                invalidRuntimeBehavior: 'fail-fast; no UInt32 truncation or wrap is accepted for method ids',
                sourceOfTruth: ['src/core/rpc/contract.ts', 'src/core/ring/endpoint.ts'],
            },
        },
    };
}

function createFrameFixture({ constants, enums }, layout, alignedBytesPayloadFlag) {
    const headerSize = requiredConst(constants, 'HEADER_SIZE');
    const frameMagic = requiredConst(constants, 'FRAME_MAGIC');
    const frameVersion = requiredConst(constants, 'FRAME_VERSION');
    const uint32Max = requiredConst(constants, 'UINT32_MAX');
    const opcode = requiredEnum(enums, 'Opcode');
    const baseHeader = {
        magic: frameMagic,
        version: frameVersion,
        opcode: opcode.get('REQUEST'),
        flags: 0,
        requestId: 0,
        methodId: 0,
        statusCode: 0,
        payloadLength: 0,
        reserved: 0,
    };
    const vectors = [
        vector('minimal-close-frame', 'minimum valid frame: header only, methodId boundary 0', 64, { ...baseHeader, opcode: opcode.get('CLOSE') }, []),
        vector(
            'request-method-one-with-padding',
            'request frame with methodId 1 and five bytes of padding',
            64,
            { ...baseHeader, opcode: opcode.get('REQUEST'), requestId: 1, methodId: 1 },
            [0xaa, 0xbb, 0xcc],
        ),
        vector(
            'response-ok-empty',
            'response-ok frame with empty payload',
            64,
            { ...baseHeader, opcode: opcode.get('RESPONSE_OK'), requestId: 2, methodId: 1 },
            [],
        ),
        vector(
            'response-error-negative-status',
            'error frame with signed statusCode encoded as little-endian Int32',
            64,
            { ...baseHeader, opcode: opcode.get('RESPONSE_ERR'), requestId: 3, methodId: 1, statusCode: -7 },
            [0xde, 0xad, 0xbe, 0xef],
        ),
        vector(
            'cancel-method-id-max',
            'cancel frame with methodId boundary 0xffffffff',
            64,
            { ...baseHeader, opcode: opcode.get('CANCEL'), requestId: 4, methodId: uint32Max },
            [0x01],
        ),
        vector(
            'capacity-local-max-frame-size',
            'maximum frame size for a 64-byte ring capacity',
            64,
            { ...baseHeader, opcode: opcode.get('REQUEST'), requestId: 5, methodId: 1 },
            Array.from({ length: 32 }, (_, index) => index),
        ),
        vector(
            'wrapped-read-seq-payload-range',
            'validated payload range remains stable when the logical frame wraps the ring boundary',
            64,
            { ...baseHeader, opcode: opcode.get('NOTIFY'), requestId: 6, methodId: 1 },
            [0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16],
            48,
        ),
    ];
    return {
        version: 3,
        sourceOfTruth: ['src/core/constants.ts', 'src/core/ring/endpoint.ts', 'formal/lean/Shirika/Frame.lean'],
        generatedBy,
        headerSize,
        layout,
        vectors,
        alignedBytesPayload: createAlignedBytesPayloadFixture(baseHeader, opcode, alignedBytesPayloadFlag, headerSize, layout),
        paddingLengthCases: Array.from({ length: 8 }, (_, payloadLength) => {
            const frameSize = align8(headerSize + payloadLength);
            const payloadSeq = headerSize;
            const paddingSeq = payloadSeq + payloadLength;
            return {
                payloadLength,
                frameSize,
                payloadSeq,
                paddingSeq,
                paddingLength: frameSize - headerSize - payloadLength,
                nextReadSeq: frameSize,
            };
        }),
        invalidCases: [
            {
                name: 'capacity-below-frame-header',
                purpose: 'ring capacity must be large enough to hold a minimum frame header',
                input: { capacityBytes: headerSize / 2 },
                expectedErrorClass: 'ShirikaError',
            },
            {
                name: 'payload-exceeds-capacity-local-frame-max',
                purpose: 'payloadLength greater than capacityBytes - HEADER_SIZE is rejected before align8',
                input: { capacityBytes: 64, payloadLength: 33 },
                expectedErrorClass: 'ShirikaOversizeError on send / ShirikaProtocolError on receive',
            },
            {
                name: 'invalid-magic',
                purpose: 'receive boundary rejects headers before creating a ValidatedFrame witness',
                input: { magic: 0xdeadbeef },
                expectedErrorClass: 'ShirikaProtocolError',
            },
            {
                name: 'invalid-version',
                purpose: 'receive boundary rejects unsupported frame versions before creating a ValidatedFrame witness',
                input: { version: 2 },
                expectedErrorClass: 'ShirikaProtocolError',
            },
            {
                name: 'invalid-opcode',
                purpose: 'receive boundary rejects unknown opcodes before creating a ValidatedFrame witness',
                input: { opcode: 65535 },
                expectedErrorClass: 'ShirikaProtocolError',
            },
            {
                name: 'truncated-after-valid-header',
                purpose: 'full-frame-readable check is still required after successful header validation',
                input: { capacityBytes: 64, payloadLength: 8, committedBytes: 32 },
                expectedErrorClass: 'ShirikaProtocolError',
            },
            {
                name: 'contract-method-id-zero',
                purpose: 'contract methods are 1-based even though the wire UInt32 field allows 0',
                input: { methodId: 0 },
                expectedErrorClass: 'TypeError',
            },
            {
                name: 'method-id-over-uint32',
                purpose: 'method ids above UInt32 max fail fast instead of wrapping to the wire field',
                input: { methodId: uint32Max + 1 },
                expectedErrorClass: 'TypeError or ShirikaProtocolError',
            },
        ],
    };

    function vector(name, purpose, capacityBytes, headerFields, payloadBytes, readSeq = 0) {
        const header = { ...headerFields, payloadLength: payloadBytes.length };
        const headerBytes = encodeHeader(layout, header, headerSize);
        const frameSize = align8(headerSize + payloadBytes.length);
        const paddingLength = frameSize - headerSize - payloadBytes.length;
        const payloadSeq = u32(readSeq + headerSize);
        const paddingSeq = u32(payloadSeq + payloadBytes.length);
        return {
            name,
            purpose,
            capacityBytes,
            frameSize,
            payloadRange: {
                readSeq,
                payloadSeq,
                payloadLength: payloadBytes.length,
                paddingSeq,
                paddingLength,
                nextReadSeq: u32(readSeq + frameSize),
            },
            header,
            headerHex: bytesToHex(headerBytes),
            payloadHex: bytesToHex(payloadBytes),
            paddingHex: bytesToHex(new Uint8Array(paddingLength)),
        };
    }
}

function createAlignedBytesPayloadFixture(baseHeader, opcode, alignedBytesPayloadFlag, headerSize, layout) {
    const validVectors = [
        alignedVector('aligned-empty-bytes', 'empty aligned bytes payload validates to an empty byte body', 64, 10, [], 0),
        alignedVector('aligned-one-byte', 'one-byte aligned bytes payload validates and decodes through the bytes codec path', 64, 11, [0x2a], 0),
        alignedVector('aligned-small-bytes', 'small aligned bytes payload validates with ordinary no-wrap layout', 64, 12, [0, 1, 2, 3, 4, 5, 6, 7, 8], 0),
        alignedVector(
            'aligned-prefix-wraps',
            'the 8-byte aligned prefix wraps around the ring boundary and is still validated once',
            128,
            13,
            [0x61, 0x62, 0x63],
            94,
        ),
        alignedVector(
            'aligned-body-wraps',
            'the byte body wraps around the ring boundary after a contiguous aligned prefix',
            128,
            14,
            [0x71, 0x72, 0x73, 0x74],
            86,
        ),
    ];
    return {
        flag: alignedBytesPayloadFlag,
        prefixLength: 8,
        relationLaw: 'payloadLength === byteLength + 8',
        leanTheorems: [
            'Shirika.Frame.alignedBytes_prefix_range_inside_payload',
            'Shirika.Frame.alignedBytes_bytes_range_inside_payload',
            'Shirika.Frame.validateHeader_success_and_alignedBytes_implies_bytes_range_readable',
        ],
        benchmarkPayloadSizes: ['1MiB', '8MiB', '32MiB'],
        vectors: validVectors,
        invalidCases: [
            invalidAlignedCase('aligned-payload-length-too-small', 'header payloadLength is one byte smaller than byteLength + 8', 64, 20, 11, 4, 4),
            invalidAlignedCase('aligned-payload-length-too-large', 'header payloadLength is one byte larger than byteLength + 8', 64, 21, 13, 4, 4),
            invalidAlignedCase(
                'aligned-declared-byte-length-too-small',
                'prefix byteLength is smaller than the body implied by the header payloadLength',
                64,
                22,
                12,
                3,
                4,
            ),
            invalidAlignedCase(
                'aligned-declared-byte-length-too-large',
                'prefix byteLength is larger than the body implied by the header payloadLength',
                64,
                23,
                12,
                5,
                4,
            ),
            invalidAlignedCase(
                'aligned-payload-shorter-than-prefix',
                'payloadLength shorter than the mandatory 8-byte prefix is rejected before branding',
                64,
                24,
                4,
                0,
                0,
            ),
        ],
    };

    function alignedVector(name, purpose, capacityBytes, requestId, bodyBytes, readSeq) {
        const payloadBytes = encodeAlignedBytesPayload(bodyBytes, bodyBytes.length);
        const header = {
            ...baseHeader,
            opcode: opcode.get('REQUEST'),
            flags: alignedBytesPayloadFlag,
            requestId,
            methodId: 1,
            payloadLength: payloadBytes.length,
        };
        const headerBytes = encodeHeader(layout, header, headerSize);
        const frameSize = align8(headerSize + payloadBytes.length);
        const payloadSeq = u32(readSeq + headerSize);
        const paddingSeq = u32(payloadSeq + payloadBytes.length);
        return {
            name,
            purpose,
            capacityBytes,
            frameSize,
            payloadRange: {
                readSeq,
                payloadSeq,
                payloadLength: payloadBytes.length,
                paddingSeq,
                paddingLength: frameSize - headerSize - payloadBytes.length,
                nextReadSeq: u32(readSeq + frameSize),
            },
            alignedBytesRange: {
                prefixSeq: payloadSeq,
                prefixLength: 8,
                prefixReserved: 0,
                byteLength: bodyBytes.length,
                bytesSeq: u32(payloadSeq + 8),
                payloadLength: payloadBytes.length,
                bytesHex: bytesToHex(bodyBytes),
                binaryBytesHex: bytesToHex(encodeBinaryBytesPayload(bodyBytes)),
            },
            header,
            headerHex: bytesToHex(headerBytes),
            payloadHex: bytesToHex(payloadBytes),
            paddingHex: bytesToHex(new Uint8Array(frameSize - headerSize - payloadBytes.length)),
        };
    }

    function invalidAlignedCase(name, purpose, capacityBytes, requestId, headerPayloadLength, prefixByteLength, actualBodyLength) {
        const bodyBytes = Array.from({ length: actualBodyLength }, (_, index) => (0x80 + index) & 0xff);
        const payloadBytes = encodeAlignedBytesPayload(bodyBytes, prefixByteLength);
        const header = {
            ...baseHeader,
            opcode: opcode.get('REQUEST'),
            flags: alignedBytesPayloadFlag,
            requestId,
            methodId: 1,
            payloadLength: headerPayloadLength,
        };
        return {
            name,
            purpose,
            capacityBytes,
            expectedErrorClass: 'ShirikaProtocolError',
            header,
            payloadHex: bytesToHex(payloadBytes),
            relation: {
                headerPayloadLength,
                prefixByteLength,
                expectedPayloadLength: prefixByteLength + 8,
                actualBodyLength,
            },
        };
    }
}

function encodeAlignedBytesPayload(bodyBytes, declaredByteLength = bodyBytes.length) {
    const bytes = new Uint8Array(8 + bodyBytes.length);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint32(0, declaredByteLength, true);
    view.setUint32(4, 0, true);
    bytes.set(bodyBytes, 8);
    return bytes;
}

function encodeBinaryBytesPayload(bodyBytes) {
    const bytes = new Uint8Array(4 + bodyBytes.length);
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(0, bodyBytes.length, true);
    bytes.set(bodyBytes, 4);
    return bytes;
}

function constantRecord(name, value, expectedType, leanName, meaning) {
    return {
        name,
        value,
        hex: toHex(value),
        expectedType,
        tsLocation: 'src/core/constants.ts',
        leanName,
        meaning,
        sourceOfTruth: 'TypeScript',
    };
}

function enumRecord(enumName, member, value) {
    return {
        member,
        value,
        hex: toHex(value),
        tsLocation: `src/core/constants.ts:${enumName}.${member}`,
        leanName: `Shirika.Generated.Constants.${lowerCamel(enumName)}${pascal(member)}`,
        sourceOfTruth: 'TypeScript',
    };
}

function createLeanConstantsModule({ constants, enums }) {
    const lines = ['import Std', '', 'set_option autoImplicit false', '', 'namespace Shirika', 'namespace Generated', 'namespace Constants', ''];
    const constantNames = [
        ['CONTROL_I32_COUNT', 'controlI32Count'],
        ['DEFAULT_CAPACITY_BYTES', 'defaultCapacityBytes'],
        ['HEADER_SIZE', 'headerSize'],
        ['MIN_CAPACITY_BYTES', 'minCapacityBytes'],
        ['MAX_CAPACITY_BYTES', 'maxCapacityBytes'],
        ['FRAME_MAGIC', 'frameMagic'],
        ['FRAME_VERSION', 'frameVersion'],
        ['NORMALIZE_THRESHOLD', 'normalizeThreshold'],
        ['UINT32_MAX', 'uint32Max'],
        ['MAX_METHOD_ID', 'maxMethodId'],
    ];
    for (const [tsName, leanName] of constantNames) {
        lines.push(`def ${leanName} : Nat := ${requiredConst(constants, tsName)}`);
        lines.push('');
    }
    for (const [name, byte] of littleEndianByteDefs('frameMagic', requiredConst(constants, 'FRAME_MAGIC'), 4)) {
        lines.push(`def ${name} : UInt8 := ${toLeanHex(byte, 2)}`);
    }
    for (const [name, byte] of littleEndianByteDefs('frameVersion', requiredConst(constants, 'FRAME_VERSION'), 2)) {
        lines.push(`def ${name} : UInt8 := ${toLeanHex(byte, 2)}`);
    }
    lines.push('');
    for (const [enumName, members] of enums) {
        for (const [member, value] of members) {
            const leanName = `${lowerCamel(enumName)}${pascal(member)}`;
            lines.push(`def ${leanName} : Nat := ${value}`);
            if (enumName === 'Opcode') {
                for (const [byteName, byte] of littleEndianByteDefs(leanName, value, 2)) {
                    lines.push(`def ${byteName} : UInt8 := ${toLeanHex(byte, 2)}`);
                }
            }
            lines.push('');
        }
    }
    lines.push('end Constants');
    lines.push('end Generated');
    lines.push('end Shirika');
    return `${lines.join('\n')}\n`;
}

function requiredConst(constants, name) {
    const value = constants.get(name);
    if (value === undefined) {
        throw new Error(`Missing constant ${name}`);
    }
    return value;
}

function requiredEnum(enums, name) {
    const value = enums.get(name);
    if (value === undefined) {
        throw new Error(`Missing enum ${name}`);
    }
    return value;
}

function encodeHeader(layout, header, headerSize) {
    const bytes = new Uint8Array(headerSize);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (const field of layout) {
        const value = header[field.field];
        if (value === undefined) {
            throw new Error(`Missing header field ${field.field}`);
        }
        if (field.accessor === 'Uint32') {
            view.setUint32(field.offset, value, true);
        } else if (field.accessor === 'Uint16') {
            view.setUint16(field.offset, value, true);
        } else if (field.accessor === 'Int32') {
            view.setInt32(field.offset, value, true);
        } else {
            throw new Error(`Unsupported DataView accessor ${field.accessor}`);
        }
    }
    return bytes;
}

function align8(value) {
    return (value + 7) & ~7;
}

function u32(value) {
    return value >>> 0;
}

function littleEndianByteDefs(prefix, value, width) {
    const bytes = new Uint8Array(width);
    const view = new DataView(bytes.buffer);
    if (width === 4) {
        view.setUint32(0, value, true);
    } else if (width === 2) {
        view.setUint16(0, value, true);
    } else {
        throw new Error(`Unsupported width ${width}`);
    }
    return [...bytes].map((byte, index) => [`${prefix}Byte${index}`, byte]);
}

function bytesToHex(bytes) {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toHex(value) {
    if (Number.isInteger(value) && value >= 0) {
        return `0x${value.toString(16)}`;
    }
    return String(value);
}

function toLeanHex(value, width) {
    return `0x${value.toString(16).padStart(width, '0')}`;
}

function lowerCamel(value) {
    return value.slice(0, 1).toLowerCase() + value.slice(1);
}

function pascal(value) {
    return value
        .toLowerCase()
        .split('_')
        .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
        .join('');
}

async function assertFileEquals(filePath, expected) {
    let actual;
    try {
        actual = await readFile(filePath, 'utf8');
    } catch (error) {
        throw new Error(`${path.relative(rootDir, filePath)} is missing; run pnpm run formal:bridge:update`, { cause: error });
    }
    if (actual !== expected) {
        throw new Error(`${path.relative(rootDir, filePath)} is stale; run pnpm run formal:bridge:update`);
    }
}
