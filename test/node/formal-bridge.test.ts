import { describe, expect, test } from 'vitest';
import type { BinaryCodec } from '../../dist/index.js';
import {
    CancelCode,
    codecs,
    createCancelPayload,
    createCancelReason,
    createRingBufferSab,
    createRingLayout,
    createWaitStrategy,
    DuplexEndpoint,
    getControlByteLength,
    MAX_CAPACITY_BYTES,
    MAX_METHOD_ID,
    MIN_CAPACITY_BYTES,
    method,
    Opcode,
    SharedRingBuffer,
    ShirikaClosedError,
    ShirikaProtocolError,
    ShirikaTimeoutError,
} from '../../dist/index.js';

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

function createEndpointPair(capacityBytes: number) {
    const aToB = createRingBufferSab(capacityBytes);
    const bToA = createRingBufferSab(capacityBytes);
    const left = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(aToB, capacityBytes), createWaitStrategy(false), 'formal-left->right'),
        inbound: new SharedRingBuffer(createRingLayout(bToA, capacityBytes), createWaitStrategy(false), 'formal-right->left'),
    });
    const right = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(bToA, capacityBytes), createWaitStrategy(false), 'formal-right->left'),
        inbound: new SharedRingBuffer(createRingLayout(aToB, capacityBytes), createWaitStrategy(false), 'formal-left->right'),
    });
    return { left, right };
}

describe('formal bridge runtime bounds', () => {
    test('capacity bounds are explicit at ring layout creation', () => {
        expect(createRingBufferSab(MIN_CAPACITY_BYTES).byteLength).toBe(getControlByteLength() + MIN_CAPACITY_BYTES);
        expect(() => createRingBufferSab(MIN_CAPACITY_BYTES / 2)).toThrow(/at least/);
        expect(() => createRingBufferSab(MAX_CAPACITY_BYTES + 1)).toThrow(/at most/);
        expect(() => createRingBufferSab(MIN_CAPACITY_BYTES + 16)).toThrow(/power of two/);
    });

    test('contract method ids are positive UInt32 values', () => {
        expect(method(MAX_METHOD_ID, codecs.void(), codecs.void()).id).toBe(MAX_METHOD_ID);
        expect(() => method(0, codecs.void(), codecs.void())).toThrow(/1\.\./);
        expect(() => method(MAX_METHOD_ID + 1, codecs.void(), codecs.void())).toThrow(/1\.\./);
        expect(() => method(1.5, codecs.void(), codecs.void())).toThrow(/1\.\./);
    });

    test('frame-level method ids fail fast instead of wrapping', async () => {
        const { left } = createEndpointPair(64);
        await expect(left.send(Opcode.REQUEST, 1, MAX_METHOD_ID + 1, codecs.void(), undefined)).rejects.toBeInstanceOf(ShirikaProtocolError);
        await expect(left.send(Opcode.REQUEST, 1, -1, codecs.void(), undefined)).rejects.toBeInstanceOf(ShirikaProtocolError);
        await expect(left.send(Opcode.REQUEST, 1, 1.5, codecs.void(), undefined)).rejects.toBeInstanceOf(ShirikaProtocolError);
    });

    test('cancel lifecycle codes match the abstract terminal classes', () => {
        const timeoutReason = createCancelReason(createCancelPayload(CancelCode.TIMEOUT, new Error('deadline expired')));
        expect(timeoutReason).toBeInstanceOf(ShirikaTimeoutError);
        expect((timeoutReason as Error).message).toBe('deadline expired');

        const closeReason = createCancelReason(createCancelPayload(CancelCode.CLIENT_CLOSE, new Error('client closed')));
        expect(closeReason).toBeInstanceOf(ShirikaClosedError);
        expect((closeReason as Error).message).toBe('client closed');

        const abortReason = createCancelReason(createCancelPayload(CancelCode.CLIENT_ABORT, new Error('client aborted')));
        expect(abortReason).toBeInstanceOf(Error);
        expect((abortReason as Error).name).toBe('AbortError');
        expect((abortReason as Error).message).toBe('client aborted');
    });

    test('capacity-local maximum frame payload is accepted and oversize payload is rejected', async () => {
        const { left, right } = createEndpointPair(64);
        const maxLocalPayload = new Uint8Array(32);
        await left.send(Opcode.REQUEST, 1, 1, rawBytesCodec, maxLocalPayload);
        const frame = await right.receive();
        expect(frame.frameSize).toBe(64);
        expect(frame.readWithCodec(rawBytesCodec)).toEqual(maxLocalPayload);
        await expect(left.send(Opcode.REQUEST, 2, 1, rawBytesCodec, new Uint8Array(33))).rejects.toThrow(/exceeds capacity/);
    });
});
