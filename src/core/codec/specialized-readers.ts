import { ShirikaProtocolError } from '../errors.js';
import type { SharedRingBuffer } from '../ring/shared-ring.js';
import { u32 } from '../utils.js';
import type { InternalReadSideStrategy } from './witness.js';

interface ReadStep {
    readonly size: number;
}

const boolU8Plan = Object.freeze([{ size: 1 }, { size: 1 }] satisfies ReadStep[]);
const boolU16Plan = Object.freeze([{ size: 1 }, { size: 2 }] satisfies ReadStep[]);
const simpleStructPlan = Object.freeze([{ size: 1 }, { size: 2 }, { size: 1 }] satisfies ReadStep[]);

const voidStrategy = defineStrategy({
    id: 'read-side:void',
    conformanceVectors: ['primitive-void'],
    validateAndDecode(ring, range) {
        void ring;
        validateFixedReadPlan(range.payloadLength, []);
        return undefined;
    },
});

const boolStrategy = defineStrategy({
    id: 'read-side:bool',
    conformanceVectors: ['primitive-bool'],
    validateAndDecode(ring, range) {
        validateFixedReadPlan(range.payloadLength, [{ size: 1 }]);
        return readBoolAt(ring, range.payloadSeq);
    },
});

const u8Strategy = defineStrategy({
    id: 'read-side:u8',
    conformanceVectors: ['primitive-u8'],
    validateAndDecode(ring, range) {
        validateFixedReadPlan(range.payloadLength, [{ size: 1 }]);
        return ring.readByte(range.payloadSeq);
    },
});

const u16Strategy = defineStrategy({
    id: 'read-side:u16',
    conformanceVectors: ['primitive-u16'],
    validateAndDecode(ring, range) {
        validateFixedReadPlan(range.payloadLength, [{ size: 2 }]);
        return readU16At(ring, range.payloadSeq);
    },
});

const u32Strategy = defineStrategy({
    id: 'read-side:u32',
    conformanceVectors: ['primitive-u32'],
    validateAndDecode(ring, range) {
        validateFixedReadPlan(range.payloadLength, [{ size: 4 }]);
        return readU32At(ring, range.payloadSeq);
    },
});

const i32Strategy = defineStrategy({
    id: 'read-side:i32',
    conformanceVectors: ['primitive-i32'],
    validateAndDecode(ring, range) {
        validateFixedReadPlan(range.payloadLength, [{ size: 4 }]);
        return readI32At(ring, range.payloadSeq);
    },
});

const tupleBoolU8Strategy = defineStrategy({
    id: 'read-side:tuple(bool,u8)',
    conformanceVectors: ['tuple-bool-u8'],
    validateAndDecode(ring, range) {
        validateFixedReadPlan(range.payloadLength, boolU8Plan);
        return [readBoolAt(ring, range.payloadSeq), ring.readByte(u32(range.payloadSeq + 1))];
    },
});

const tupleBoolU16Strategy = defineStrategy({
    id: 'read-side:tuple(bool,u16)',
    conformanceVectors: ['tuple-bool-u16'],
    validateAndDecode(ring, range) {
        validateFixedReadPlan(range.payloadLength, boolU16Plan);
        return [readBoolAt(ring, range.payloadSeq), readU16At(ring, u32(range.payloadSeq + 1))];
    },
});

const simpleStructStrategy = defineStrategy({
    id: 'read-side:struct(tag:u8,count:u16,ok:bool)',
    conformanceVectors: ['struct-simple'],
    validateAndDecode(ring, range) {
        validateFixedReadPlan(range.payloadLength, simpleStructPlan);
        return {
            tag: ring.readByte(range.payloadSeq),
            count: readU16At(ring, u32(range.payloadSeq + 1)),
            ok: readBoolAt(ring, u32(range.payloadSeq + 3)),
        };
    },
});

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
    const view = ring.getContiguousDataView(seq, 2);
    if (view !== null) {
        return view.getUint16(0, true);
    }
    const scratch = new Uint8Array(2);
    ring.readInto(seq, scratch, 0, 2);
    return new DataView(scratch.buffer, scratch.byteOffset, scratch.byteLength).getUint16(0, true);
}

function readU32At(ring: SharedRingBuffer, seq: number): number {
    const view = ring.getContiguousDataView(seq, 4);
    if (view !== null) {
        return view.getUint32(0, true);
    }
    const scratch = new Uint8Array(4);
    ring.readInto(seq, scratch, 0, 4);
    return new DataView(scratch.buffer, scratch.byteOffset, scratch.byteLength).getUint32(0, true);
}

function readI32At(ring: SharedRingBuffer, seq: number): number {
    const view = ring.getContiguousDataView(seq, 4);
    if (view !== null) {
        return view.getInt32(0, true);
    }
    const scratch = new Uint8Array(4);
    ring.readInto(seq, scratch, 0, 4);
    return new DataView(scratch.buffer, scratch.byteOffset, scratch.byteLength).getInt32(0, true);
}
