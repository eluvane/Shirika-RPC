import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { BinaryCodec, WaitResult, WaitStrategy } from '../../dist/index.js';
import {
    codecs,
    createRingBufferSab,
    createRingLayout,
    createWaitStrategy,
    DuplexEndpoint,
    FRAME_MAGIC,
    FRAME_VERSION,
    HEADER_SIZE,
    NORMALIZE_THRESHOLD,
    Opcode,
    SharedRingBuffer,
    ShirikaClosedError,
    ShirikaProtocolError,
    ShirikaTimeoutError,
} from '../../dist/index.js';

function createEndpointPair(capacityBytes: number) {
    const aToB = createRingBufferSab(capacityBytes);
    const bToA = createRingBufferSab(capacityBytes);
    const left = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(aToB, capacityBytes), createWaitStrategy(false), 'left->right'),
        inbound: new SharedRingBuffer(createRingLayout(bToA, capacityBytes), createWaitStrategy(false), 'right->left'),
    });
    const right = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(bToA, capacityBytes), createWaitStrategy(false), 'right->left'),
        inbound: new SharedRingBuffer(createRingLayout(aToB, capacityBytes), createWaitStrategy(false), 'left->right'),
    });
    return { left, right, aToB };
}
const pingCodec = codecs.struct({ text: codecs.string() });
const rawBytesCodec: BinaryCodec<Uint8Array> = {
    kind: 'binary',
    measure(value) {
        return value.byteLength;
    },
    write(writer, value) {
        writer.writeBytes(value);
    },
    read(reader) {
        return reader.readBytes(reader.remainingBytes);
    },
};
const CONTROL_INDEX = {
    READ_SEQ: 0,
    WRITE_SEQ: 1,
    DATA_SEQ: 2,
    SPACE_SEQ: 3,
} as const;
interface RawTestFrameHeader {
    readonly magic: number;
    readonly version: number;
    readonly opcode: number;
    readonly flags: number;
    readonly requestId: number;
    readonly methodId: number;
    readonly statusCode: number;
    readonly payloadLength: number;
    readonly reserved: number;
}
interface AlignedBytesFixtureVector {
    readonly name: string;
    readonly capacityBytes: number;
    readonly frameSize: number;
    readonly payloadRange: {
        readonly readSeq: number;
        readonly payloadSeq: number;
        readonly payloadLength: number;
        readonly paddingSeq: number;
        readonly paddingLength: number;
        readonly nextReadSeq: number;
    };
    readonly alignedBytesRange: {
        readonly byteLength: number;
        readonly bytesHex: string;
        readonly binaryBytesHex: string;
    };
    readonly header: RawTestFrameHeader;
    readonly payloadHex: string;
}
interface InvalidAlignedBytesFixtureCase {
    readonly name: string;
    readonly capacityBytes: number;
    readonly header: RawTestFrameHeader;
    readonly payloadHex: string;
}
interface FrameLayoutFixture {
    readonly alignedBytesPayload: {
        readonly flag: number;
        readonly vectors: readonly AlignedBytesFixtureVector[];
        readonly invalidCases: readonly InvalidAlignedBytesFixtureCase[];
    };
}
const frameLayoutFixture = readFrameLayoutFixture();
const ALIGNED_BYTES_PAYLOAD_FLAG = frameLayoutFixture.alignedBytesPayload.flag;
const BENCHMARK_SIZE_TEST_PAYLOADS = [1024 * 1024, 8 * 1024 * 1024] as const;
const BASE_HEADER: RawTestFrameHeader = {
    magic: FRAME_MAGIC,
    version: FRAME_VERSION,
    opcode: Opcode.REQUEST,
    flags: 0,
    requestId: 1,
    methodId: 1,
    statusCode: 0,
    payloadLength: 0,
    reserved: 0,
};

function align8(value: number): number {
    return (value + 7) & ~7;
}

function createHeader(fields: Partial<RawTestFrameHeader> = {}): RawTestFrameHeader {
    return { ...BASE_HEADER, ...fields };
}

function encodeFrameHeader(header: RawTestFrameHeader): Uint8Array {
    const bytes = new Uint8Array(HEADER_SIZE);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    view.setUint32(0, header.magic, true);
    view.setUint16(4, header.version, true);
    view.setUint16(6, header.opcode, true);
    view.setUint32(8, header.flags, true);
    view.setUint32(12, header.requestId, true);
    view.setUint32(16, header.methodId, true);
    view.setInt32(20, header.statusCode, true);
    view.setUint32(24, header.payloadLength, true);
    view.setUint32(28, header.reserved, true);
    return bytes;
}

function readFrameLayoutFixture(): FrameLayoutFixture {
    return JSON.parse(readFileSync(new URL('../../formal/fixtures/frame-layout-golden.json', import.meta.url), 'utf8')) as FrameLayoutFixture;
}

function hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
        throw new Error(`Invalid hex fixture with odd length: ${hex}`);
    }
    return Uint8Array.from({ length: hex.length / 2 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}

function encodeAlignedBytesPayload(body: Uint8Array, declaredByteLength = body.byteLength): Uint8Array {
    const payload = new Uint8Array(8 + body.byteLength);
    const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
    view.setUint32(0, declaredByteLength, true);
    view.setUint32(4, 0, true);
    payload.set(body, 8);
    return payload;
}

function encodeBinaryBytesPayload(body: Uint8Array): Uint8Array {
    const payload = new Uint8Array(4 + body.byteLength);
    new DataView(payload.buffer, payload.byteOffset, payload.byteLength).setUint32(0, body.byteLength, true);
    payload.set(body, 4);
    return payload;
}

function patternedBytes(length: number): Uint8Array {
    return Uint8Array.from({ length }, (_, index) => (index * 31 + 17) & 0xff);
}

function nextPowerOfTwo(value: number): number {
    let result = 1;
    while (result < value) {
        result *= 2;
    }
    return result;
}

function expectSameBytes(actual: Uint8Array, expected: Uint8Array): void {
    expect(actual.byteLength).toBe(expected.byteLength);
    for (let index = 0; index < expected.byteLength; index += 1) {
        if (actual[index] !== expected[index]) {
            throw new Error(`Unexpected byte at ${index}: expected ${expected[index]}, received ${actual[index]}`);
        }
    }
}

function writeRawInboundFrame(
    endpoint: { readonly inbound: SharedRingBuffer },
    header: RawTestFrameHeader,
    payload = new Uint8Array(0),
    options: {
        readonly readSeq?: number;
        readonly committedBytes?: number;
    } = {},
): number {
    const readSeq = options.readSeq ?? 0;
    const frameSize = align8(HEADER_SIZE + payload.byteLength);
    const committedBytes = options.committedBytes ?? frameSize;
    const frameBytes = new Uint8Array(frameSize);
    frameBytes.set(encodeFrameHeader(header));
    frameBytes.set(payload, HEADER_SIZE);
    Atomics.store(endpoint.inbound.control, CONTROL_INDEX.READ_SEQ, readSeq | 0);
    Atomics.store(endpoint.inbound.control, CONTROL_INDEX.WRITE_SEQ, readSeq | 0);
    endpoint.inbound.writeBytes(readSeq, frameBytes, 0, committedBytes);
    endpoint.inbound.commitWrite((readSeq + committedBytes) | 0);
    return frameSize;
}
class ReadableRaceRing extends SharedRingBuffer {
    #injected = false;
    #payload: Uint8Array;
    constructor(capacityBytes: number, payload: Uint8Array) {
        const waitStrategy = new InjectingWaitStrategy();
        super(createRingLayout(createRingBufferSab(capacityBytes), capacityBytes), waitStrategy, 'read-race');
        this.#payload = payload;
        waitStrategy.inject = () => {
            this.injectProgress();
        };
    }
    private injectProgress(): void {
        if (!this.#injected) {
            const writeSeq = Atomics.load(this.control, CONTROL_INDEX.WRITE_SEQ);
            this.writeBytes(writeSeq, this.#payload);
            Atomics.store(this.control, CONTROL_INDEX.WRITE_SEQ, (writeSeq + this.#payload.byteLength) | 0);
            Atomics.add(this.control, CONTROL_INDEX.DATA_SEQ, 1);
            Atomics.notify(this.control, CONTROL_INDEX.DATA_SEQ, 1);
            this.#injected = true;
        }
    }
}
class WritableRaceRing extends SharedRingBuffer {
    #injected = false;
    #freeBytes: number;
    constructor(capacityBytes: number, freeBytes: number) {
        const waitStrategy = new InjectingWaitStrategy();
        super(createRingLayout(createRingBufferSab(capacityBytes), capacityBytes), waitStrategy, 'write-race');
        this.#freeBytes = freeBytes;
        waitStrategy.inject = () => {
            this.injectProgress();
        };
    }
    private injectProgress(): void {
        if (!this.#injected) {
            const readSeq = Atomics.load(this.control, CONTROL_INDEX.READ_SEQ);
            Atomics.store(this.control, CONTROL_INDEX.READ_SEQ, (readSeq + this.#freeBytes) | 0);
            Atomics.add(this.control, CONTROL_INDEX.SPACE_SEQ, 1);
            Atomics.notify(this.control, CONTROL_INDEX.SPACE_SEQ, 1);
            this.#injected = true;
        }
    }
}
class InjectingWaitStrategy implements WaitStrategy {
    readonly canBlock = false;
    inject: (() => void) | undefined;
    async wait(_control: Int32Array, _index: number, _expected: number, _timeoutMs?: number, _signal?: AbortSignal): Promise<WaitResult> {
        this.inject?.();
        this.inject = undefined;
        return 'not-equal';
    }
}
describe('shared ring / endpoint', () => {
    test('ring write/read simple frame', async () => {
        const { left, right } = createEndpointPair(256);
        await left.send(Opcode.REQUEST, 1, 99, pingCodec, { text: 'hello' });
        const frame = await right.receive();
        expect(frame.header.opcode).toBe(Opcode.REQUEST);
        expect(frame.header.requestId).toBe(1);
        expect(frame.header.methodId).toBe(99);
        expect(frame.readWithCodec(pingCodec)).toEqual({ text: 'hello' });
    });
    test('validated frame witness exposes stable payload range for empty, small, and max payloads', async () => {
        for (const payloadLength of [0, 3, 32]) {
            const { left, right } = createEndpointPair(64);
            const payload = new Uint8Array(payloadLength).fill(payloadLength);
            await left.send(Opcode.REQUEST, 1, 3, rawBytesCodec, payload);
            const frame = await right.receive();
            const expectedFrameSize = align8(HEADER_SIZE + payloadLength);
            const expectedPaddingLength = expectedFrameSize - HEADER_SIZE - payloadLength;
            expect(frame.payloadLength).toBe(payloadLength);
            expect(frame.frameSize).toBe(expectedFrameSize);
            expect(frame.payloadRange).toEqual({
                readSeq: 0,
                payloadSeq: HEADER_SIZE,
                payloadLength,
                paddingSeq: HEADER_SIZE + payloadLength,
                paddingLength: expectedPaddingLength,
                frameSize: expectedFrameSize,
                nextReadSeq: expectedFrameSize,
            });
            expect(Object.isFrozen(frame.payloadRange)).toBe(true);
            expect(frame.readWithCodec(rawBytesCodec)).toEqual(payload);
            expect(frame.payloadRange.paddingLength).toBe(expectedPaddingLength);
        }
    });
    test('validated frame witness covers padding lengths 0 through 7', async () => {
        for (const payloadLength of [0, 1, 2, 3, 4, 5, 6, 7]) {
            const { left, right } = createEndpointPair(128);
            await left.send(Opcode.REQUEST, 1, 3, rawBytesCodec, new Uint8Array(payloadLength));
            const frame = await right.receive();
            expect(frame.payloadRange.paddingLength).toBe((8 - (payloadLength % 8)) % 8);
            expect(frame.readWithCodec(rawBytesCodec)).toEqual(new Uint8Array(payloadLength));
        }
    });
    test('wrap-around frame read/write', async () => {
        const { left, right } = createEndpointPair(128);
        const bytesCodec = codecs.bytes();
        const first = new Uint8Array(40).fill(1);
        const second = new Uint8Array(24).fill(2);
        await left.send(Opcode.REQUEST, 1, 3, bytesCodec, first);
        expect((await right.receive()).readWithCodec(bytesCodec)).toEqual(first);
        await left.send(Opcode.REQUEST, 2, 3, bytesCodec, second);
        const wrappedFrame = await right.receive();
        expect(wrappedFrame.header.requestId).toBe(2);
        expect(wrappedFrame.readWithCodec(bytesCodec)).toEqual(second);
    });
    test('validated frame witness keeps logical payload range when header wraps ring boundary', async () => {
        const { right } = createEndpointPair(64);
        const payload = new Uint8Array([0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16]);
        const readSeq = 48;
        const frameSize = writeRawInboundFrame(
            right,
            createHeader({
                opcode: Opcode.NOTIFY,
                payloadLength: payload.byteLength,
            }),
            payload,
            {
                readSeq,
            },
        );
        const frame = await right.receive();
        expect(frame.frameSize).toBe(frameSize);
        expect(frame.payloadRange).toEqual({
            readSeq,
            payloadSeq: readSeq + HEADER_SIZE,
            payloadLength: payload.byteLength,
            paddingSeq: readSeq + HEADER_SIZE + payload.byteLength,
            paddingLength: frameSize - HEADER_SIZE - payload.byteLength,
            frameSize,
            nextReadSeq: readSeq + frameSize,
        });
        expect(frame.readWithCodec(rawBytesCodec)).toEqual(payload);
    });
    test('aligned bytes bridge fixture vectors validate once and decode through the bytes path', async () => {
        const bytesCodec = codecs.bytes();
        for (const vector of frameLayoutFixture.alignedBytesPayload.vectors) {
            const { right } = createEndpointPair(vector.capacityBytes);
            const frameSize = writeRawInboundFrame(right, vector.header, hexToBytes(vector.payloadHex), {
                readSeq: vector.payloadRange.readSeq,
            });
            const frame = await right.receive();
            expect(frameSize).toBe(vector.frameSize);
            expect(frame.frameSize).toBe(vector.frameSize);
            expect(frame.payloadLength).toBe(vector.payloadRange.payloadLength);
            expect(frame.payloadRange).toEqual({
                ...vector.payloadRange,
                frameSize: vector.frameSize,
            });
            expectSameBytes(frame.readWithCodec(bytesCodec), hexToBytes(vector.alignedBytesRange.bytesHex));

            const { right: rawRight } = createEndpointPair(vector.capacityBytes);
            writeRawInboundFrame(rawRight, vector.header, hexToBytes(vector.payloadHex), {
                readSeq: vector.payloadRange.readSeq,
            });
            expectSameBytes((await rawRight.receive()).readPayloadBytes(), hexToBytes(vector.alignedBytesRange.binaryBytesHex));
        }
    });

    test('validated aligned bytes witness handles benchmark-sized payloads', async () => {
        const bytesCodec = codecs.bytes();
        for (const byteLength of BENCHMARK_SIZE_TEST_PAYLOADS) {
            const capacityBytes = nextPowerOfTwo(HEADER_SIZE + byteLength + 16);
            const payload = patternedBytes(byteLength);
            const { left, right } = createEndpointPair(capacityBytes);
            await left.send(Opcode.REQUEST, 1, 3, bytesCodec, payload);
            const frame = await right.receive();
            expect((frame.header.flags & ALIGNED_BYTES_PAYLOAD_FLAG) !== 0).toBe(true);
            expect(frame.payloadLength).toBe(byteLength + 8);
            expectSameBytes(frame.readWithCodec(bytesCodec), payload);
        }
    });

    test('aligned bytes boundary rejects malformed prefix relations before branding', async () => {
        for (const invalidCase of frameLayoutFixture.alignedBytesPayload.invalidCases) {
            const { right } = createEndpointPair(invalidCase.capacityBytes);
            writeRawInboundFrame(right, invalidCase.header, hexToBytes(invalidCase.payloadHex));
            await expect(right.receive()).rejects.toBeInstanceOf(ShirikaProtocolError);
        }
    });

    test('aligned flag absent keeps the ordinary binary bytes fallback', async () => {
        const { right } = createEndpointPair(64);
        const body = new Uint8Array([9, 8, 7, 6]);
        const payload = encodeBinaryBytesPayload(body);
        writeRawInboundFrame(right, createHeader({ flags: 0, payloadLength: payload.byteLength }), payload);
        const frame = await right.receive();
        expect((frame.header.flags & ALIGNED_BYTES_PAYLOAD_FLAG) === 0).toBe(true);
        expect(frame.readWithCodec(codecs.bytes())).toEqual(body);
    });

    test('aligned flag with a non-bytes binary codec preserves the raw safe-reader path', async () => {
        const { right } = createEndpointPair(64);
        const body = new Uint8Array([1, 2, 3, 4]);
        const payload = encodeAlignedBytesPayload(body);
        writeRawInboundFrame(
            right,
            createHeader({
                flags: ALIGNED_BYTES_PAYLOAD_FLAG,
                payloadLength: payload.byteLength,
            }),
            payload,
        );
        const frame = await right.receive();
        expectSameBytes(frame.readWithCodec(rawBytesCodec), payload);
    });

    test('backpressure wait resumes when space is freed', async () => {
        const { left, right } = createEndpointPair(128);
        const bytesCodec = codecs.bytes();
        const large = new Uint8Array(80).fill(7);
        const small = new Uint8Array(8).fill(9);
        await left.send(Opcode.REQUEST, 1, 3, bytesCodec, large);
        const blockedSend = left.send(Opcode.REQUEST, 2, 3, bytesCodec, small, {
            timeoutMs: 200,
        });
        const drainedFirst = new Promise<void>((resolve, reject) => {
            setTimeout(() => {
                void right
                    .receive()
                    .then((frame) => {
                        expect(frame.readWithCodec(bytesCodec)).toEqual(large);
                        resolve();
                    })
                    .catch(reject);
            }, 10);
        });
        await expect(blockedSend).resolves.toBeUndefined();
        await drainedFirst;
        expect((await right.receive()).readWithCodec(bytesCodec)).toEqual(small);
    });
    test('waitForReadable does not miss progress published between snapshot and wait registration', async () => {
        const ring = new ReadableRaceRing(128, new Uint8Array([1, 2, 3, 4]));
        const readSeq = await ring.waitForReadable(4, 20);
        expect(readSeq).toBe(0);
        const bytes = new Uint8Array(4);
        ring.readInto(readSeq, bytes);
        expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4]));
    });
    test('waitForWritable does not miss space published between snapshot and wait registration', async () => {
        const ring = new WritableRaceRing(128, 32);
        Atomics.store(ring.control, CONTROL_INDEX.WRITE_SEQ, 128);
        const writeSeq = await ring.waitForWritable(32, 20);
        expect(writeSeq).toBe(128);
    });
    test('public ring snapshot reports used/free bytes and saturation', () => {
        const sab = createRingBufferSab(128);
        const ring = new SharedRingBuffer(createRingLayout(sab, 128), createWaitStrategy(false), 'snapshot');
        expect(ring.snapshot()).toMatchObject({
            usedBytes: 0,
            freeBytes: 128,
            saturation: 0,
        });
        ring.writeBytes(0, new Uint8Array(16).fill(1));
        ring.commitWrite(16);
        const mid = ring.snapshot();
        expect(mid.usedBytes).toBe(16);
        expect(mid.freeBytes).toBe(112);
        expect(mid.saturation).toBeCloseTo(16 / 128);
        ring.commitRead(16);
        expect(ring.snapshot()).toMatchObject({
            usedBytes: 0,
            freeBytes: 128,
            saturation: 0,
        });
    });
    test('timeout on send when ring is full', async () => {
        const { left } = createEndpointPair(128);
        const bytesCodec = codecs.bytes();
        const large = new Uint8Array(80).fill(1);
        const small = new Uint8Array(8).fill(2);
        await left.send(Opcode.REQUEST, 1, 3, bytesCodec, large);
        await expect(
            left.send(Opcode.REQUEST, 2, 3, bytesCodec, small, {
                timeoutMs: 10,
            }),
        ).rejects.toBeInstanceOf(ShirikaTimeoutError);
    });
    test('close semantics wake waiting readers', async () => {
        const { left, right } = createEndpointPair(128);
        const readPromise = right.receive(250);
        setTimeout(() => {
            left.forceClose();
        }, 10);
        await expect(readPromise).rejects.toBeInstanceOf(ShirikaClosedError);
    });
    test('send respects AbortSignal while waiting for space', async () => {
        const { left } = createEndpointPair(128);
        const bytesCodec = codecs.bytes();
        const large = new Uint8Array(80).fill(3);
        const small = new Uint8Array(8).fill(4);
        const controller = new AbortController();
        await left.send(Opcode.REQUEST, 1, 3, bytesCodec, large);
        const blockedSend = left.send(Opcode.REQUEST, 2, 3, bytesCodec, small, {
            signal: controller.signal,
        });
        setTimeout(() => {
            controller.abort(new DOMException('stop waiting', 'AbortError'));
        }, 10);
        await expect(blockedSend).rejects.toMatchObject({ name: 'AbortError' });
    });
    test('normalizes empty ring after large sequence values', () => {
        const sab = createRingBufferSab(128);
        const ring = new SharedRingBuffer(createRingLayout(sab, 128), createWaitStrategy(false), 'normalize');
        Atomics.store(ring.control, 0, (NORMALIZE_THRESHOLD + 64) | 0);
        Atomics.store(ring.control, 1, (NORMALIZE_THRESHOLD + 64) | 0);
        ring.maybeNormalize();
        expect(Atomics.load(ring.control, 0)).toBe(0);
        expect(Atomics.load(ring.control, 1)).toBe(0);
    });
    test('supports long wrap-around near 32-bit sequence rollover', async () => {
        const { left, right, aToB } = createEndpointPair(128);
        const bytesCodec = codecs.bytes();
        const control = new Int32Array(aToB, 0, 8);
        Atomics.store(control, 0, 4294967040 | 0);
        Atomics.store(control, 1, 4294967040 | 0);
        await left.send(Opcode.REQUEST, 1, 3, bytesCodec, new Uint8Array([1, 2, 3, 4]));
        const first = await right.receive();
        expect(first.header.requestId).toBe(1);
        expect(first.readWithCodec(bytesCodec)).toEqual(new Uint8Array([1, 2, 3, 4]));
        await left.send(Opcode.REQUEST, 2, 3, bytesCodec, new Uint8Array([5, 6, 7, 8]));
        const second = await right.receive();
        expect(second.header.requestId).toBe(2);
        expect(second.readWithCodec(bytesCodec)).toEqual(new Uint8Array([5, 6, 7, 8]));
    });
    test('protocol validation rejects corrupted frame', async () => {
        const { right } = createEndpointPair(128);
        writeRawInboundFrame(right, createHeader({ magic: 0xdeadbeef }), new Uint8Array(0), { committedBytes: HEADER_SIZE });
        await expect(right.receive()).rejects.toBeInstanceOf(ShirikaProtocolError);
    });
    test('receive boundary rejects invalid magic, version, and opcode before creating a frame witness', async () => {
        const cases: Array<readonly [string, RawTestFrameHeader]> = [
            ['magic', createHeader({ magic: 0xdeadbeef })],
            ['version', createHeader({ version: FRAME_VERSION + 1 })],
            ['opcode', createHeader({ opcode: 0xffff })],
        ];
        for (const [, header] of cases) {
            const { right } = createEndpointPair(64);
            writeRawInboundFrame(right, header, new Uint8Array(0), {
                committedBytes: HEADER_SIZE,
            });
            await expect(right.receive()).rejects.toBeInstanceOf(ShirikaProtocolError);
        }
    });
    test('receive boundary rejects payload length over capacity', async () => {
        const { right } = createEndpointPair(64);
        writeRawInboundFrame(right, createHeader({ payloadLength: 33 }), new Uint8Array(0), { committedBytes: HEADER_SIZE });
        await expect(right.receive()).rejects.toThrow(/exceeds capacity/);
    });
    test('receive boundary preserves truncated-frame check after valid header validation', async () => {
        const { right } = createEndpointPair(64);
        writeRawInboundFrame(right, createHeader({ payloadLength: 8 }), new Uint8Array(8), { committedBytes: HEADER_SIZE });
        await expect(right.receive()).rejects.toThrow(/Truncated frame/);
    });
});
