import { ShirikaProtocolError } from '../errors.js';
import type { SharedRingBuffer } from '../ring/shared-ring.js';
import { u32 } from '../utils.js';
import type { InternalReadSideStrategy } from './witness.js';

interface ReadStep {
    readonly size: number;
}

const size1 = Object.freeze([{ size: 1 }] satisfies ReadStep[]);
const size2 = Object.freeze([{ size: 2 }] satisfies ReadStep[]);
const size4 = Object.freeze([{ size: 4 }] satisfies ReadStep[]);
const boolU8Plan = Object.freeze([{ size: 1 }, { size: 1 }] satisfies ReadStep[]);
const boolU16Plan = Object.freeze([{ size: 1 }, { size: 2 }] satisfies ReadStep[]);
const simpleStructPlan = Object.freeze([{ size: 1 }, { size: 2 }, { size: 1 }] satisfies ReadStep[]);

const voidStrategy = defineFixedStrategy('void', 'primitive-void', [], () => undefined);
const boolStrategy = defineFixedStrategy('bool', 'primitive-bool', size1, readBoolAt);
const u8Strategy = defineFixedStrategy('u8', 'primitive-u8', size1, (ring, seq) => ring.readByte(seq));
const u16Strategy = defineFixedStrategy('u16', 'primitive-u16', size2, readU16At);
const u32Strategy = defineFixedStrategy('u32', 'primitive-u32', size4, (ring, seq) => readFixedAt(ring, seq, 4, (view) => view.getUint32(0, true)));
const i32Strategy = defineFixedStrategy('i32', 'primitive-i32', size4, (ring, seq) => readFixedAt(ring, seq, 4, (view) => view.getInt32(0, true)));
const tupleBoolU8Strategy = defineFixedStrategy('tuple(bool,u8)', 'tuple-bool-u8', boolU8Plan, (ring, seq) => [
    readBoolAt(ring, seq),
    ring.readByte(u32(seq + 1)),
]);
const tupleBoolU16Strategy = defineFixedStrategy('tuple(bool,u16)', 'tuple-bool-u16', boolU16Plan, (ring, seq) => [
    readBoolAt(ring, seq),
    readU16At(ring, u32(seq + 1)),
]);
const simpleStructStrategy = defineFixedStrategy('struct(tag:u8,count:u16,ok:bool)', 'struct-simple', simpleStructPlan, (ring, seq) => ({
    tag: ring.readByte(seq),
    count: readU16At(ring, u32(seq + 1)),
    ok: readBoolAt(ring, u32(seq + 3)),
}));

const specializedReadSideStrategies = new Map<string, InternalReadSideStrategy>([
    ['void', voidStrategy],
    ['bool', boolStrategy],
    ['u8', u8Strategy],
    ['u16', u16Strategy],
    ['u32', u32Strategy],
    ['i32', i32Strategy],
    ['tuple(bool,u8)', tupleBoolU8Strategy],
    ['tuple(bool,u16)', tupleBoolU16Strategy],
    ['struct(tag:u8,count:u16,ok:bool)', simpleStructStrategy],
]);

export function getSpecializedReadSideStrategy(signature: string): InternalReadSideStrategy | undefined {
    return specializedReadSideStrategies.get(signature);
}

function defineFixedStrategy<T>(
    signature: string,
    conformanceVector: string,
    plan: readonly ReadStep[],
    decode: (ring: SharedRingBuffer, payloadSeq: number) => T,
): InternalReadSideStrategy {
    return defineStrategy({
        id: `read-side:${signature}`,
        conformanceVectors: [conformanceVector],
        validateAndDecode(ring, range) {
            validateFixedReadPlan(range.payloadLength, plan);
            return decode(ring, range.payloadSeq);
        },
    });
}

function defineStrategy(strategy: InternalReadSideStrategy): InternalReadSideStrategy {
    return Object.freeze({
        id: strategy.id,
        conformanceVectors: Object.freeze([...strategy.conformanceVectors]),
        validateAndDecode: strategy.validateAndDecode,
    });
}

function validateFixedReadPlan(payloadLength: number, plan: readonly ReadStep[]): void {
    let consumed = 0;
    for (const step of plan) {
        const remaining = payloadLength - consumed;
        if (remaining < step.size) {
            throw new ShirikaProtocolError(`Binary reader underflow: need ${step.size} bytes with only ${Math.max(0, remaining)} bytes remaining`);
        }
        consumed += step.size;
    }
    if (consumed !== payloadLength) {
        throw new ShirikaProtocolError(`Binary reader did not consume payload exactly: expected ${payloadLength}, read ${consumed}`);
    }
}

function readBoolAt(ring: SharedRingBuffer, seq: number): boolean {
    return ring.readByte(seq) !== 0;
}

function readU16At(ring: SharedRingBuffer, seq: number): number {
    return readFixedAt(ring, seq, 2, (view) => view.getUint16(0, true));
}

function readFixedAt(ring: SharedRingBuffer, seq: number, size: number, read: (view: DataView) => number): number {
    const view = ring.getContiguousDataView(seq, size);
    if (view !== null) {
        return read(view);
    }
    const scratch = new Uint8Array(size);
    ring.readInto(seq, scratch, 0, size);
    return read(new DataView(scratch.buffer, scratch.byteOffset, scratch.byteLength));
}
