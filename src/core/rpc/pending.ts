import { UINT32_MAX } from '../constants.js';
import { ShirikaClosedError, ShirikaProtocolError } from '../errors.js';

declare const pendingRequestIdBrand: unique symbol;

export type PendingRequestId = number & { readonly [pendingRequestIdBrand]: 'PendingRequestId' };

export interface PendingRequestWitness<Entry extends object> {
    readonly requestId: PendingRequestId;
    readonly entry: Entry;
}

export interface PendingRequestRelease<Entry extends object> {
    readonly requestId: number;
    readonly entry: Entry;
}

interface PendingRequestSlot<Entry extends object> {
    readonly entry: Entry;
    witness: MutablePendingRequestWitness<Entry> | undefined;
}

interface MutablePendingRequestWitness<Entry extends object> extends PendingRequestWitness<Entry> {
    released: boolean;
}

export class PendingRequestStore<Entry extends object> {
    readonly #pending = new Map<number, PendingRequestSlot<Entry>>();
    #nextRequestId: number;

    constructor(nextRequestId = 1) {
        this.#nextRequestId = normalizeInitialRequestId(nextRequestId);
    }

    get size(): number {
        return this.#pending.size;
    }

    has(requestId: number): boolean {
        return this.#pending.has(requestId);
    }

    allocateRequestId(): number {
        for (let attempts = 0; attempts < UINT32_MAX; attempts += 1) {
            let requestId = this.#nextRequestId >>> 0;
            if (requestId === 0) {
                requestId = 1;
            }
            this.#nextRequestId = (requestId + 1) >>> 0;
            if (this.#nextRequestId === 0) {
                this.#nextRequestId = 1;
            }
            if (!this.#pending.has(requestId)) {
                return requestId;
            }
        }
        throw new ShirikaClosedError('No free request ids available');
    }

    insertAllocated(requestId: number, entry: Entry): PendingRequestWitness<Entry> {
        const slot = this.insertAllocatedSlot(requestId, entry);
        const witness = createWitnessAfterInsertion(requestId, entry);
        slot.witness = witness;
        return witness;
    }

    insertAllocatedWithoutWitness(requestId: number, entry: Entry): void {
        this.insertAllocatedSlot(requestId, entry);
    }

    releaseByWitness(witness: PendingRequestWitness<Entry>): PendingRequestRelease<Entry> | undefined {
        const mutableWitness = toMutableWitness(witness);
        if (mutableWitness.released) {
            return undefined;
        }
        const requestId = witness.requestId;
        const slot = this.#pending.get(requestId);
        if (slot?.entry !== witness.entry || slot.witness !== witness) {
            mutableWitness.released = true;
            return undefined;
        }
        this.#pending.delete(requestId);
        mutableWitness.released = true;
        return { requestId, entry: slot.entry };
    }

    lookupUntrusted(requestId: number): PendingRequestRelease<Entry> | undefined {
        const slot = this.#pending.get(requestId);
        if (slot === undefined) {
            return undefined;
        }
        return { requestId, entry: slot.entry };
    }

    releaseKnownEntry(requestId: number, entry: Entry): PendingRequestRelease<Entry> | undefined {
        const slot = this.#pending.get(requestId);
        if (slot?.entry !== entry) {
            return undefined;
        }
        this.#pending.delete(requestId);
        if (slot.witness !== undefined) {
            slot.witness.released = true;
        }
        return { requestId, entry: slot.entry };
    }

    releaseUntrusted(requestId: number): PendingRequestRelease<Entry> | undefined {
        const slot = this.#pending.get(requestId);
        if (slot === undefined) {
            return undefined;
        }
        this.#pending.delete(requestId);
        if (slot.witness !== undefined) {
            slot.witness.released = true;
        }
        return { requestId, entry: slot.entry };
    }

    entriesSnapshot(): Array<PendingRequestRelease<Entry>> {
        return Array.from(this.#pending.entries(), ([requestId, slot]) => ({ requestId, entry: slot.entry }));
    }

    witnessesSnapshot(): Array<PendingRequestWitness<Entry>> {
        const witnesses: Array<PendingRequestWitness<Entry>> = [];
        for (const slot of this.#pending.values()) {
            if (slot.witness !== undefined) {
                witnesses.push(slot.witness);
            }
        }
        return witnesses;
    }

    private insertAllocatedSlot(requestId: number, entry: Entry): PendingRequestSlot<Entry> {
        assertAllocatedRequestId(requestId);
        if (this.#pending.has(requestId)) {
            throw new ShirikaProtocolError(`Request id ${requestId} is already pending`);
        }
        const slot: PendingRequestSlot<Entry> = { entry, witness: undefined };
        this.#pending.set(requestId, slot);
        return slot;
    }
}

function normalizeInitialRequestId(nextRequestId: number): number {
    if (!Number.isInteger(nextRequestId) || nextRequestId < 0 || nextRequestId > UINT32_MAX) {
        throw new ShirikaProtocolError(`Initial request id must be a UInt32 value, got ${nextRequestId}`);
    }
    return nextRequestId === 0 ? 1 : nextRequestId >>> 0;
}

function assertAllocatedRequestId(requestId: number): void {
    if (!Number.isInteger(requestId) || requestId <= 0 || requestId > UINT32_MAX) {
        throw new ShirikaProtocolError(`Allocated request id must be a non-zero UInt32 value, got ${requestId}`);
    }
}

function createWitnessAfterInsertion<Entry extends object>(requestId: number, entry: Entry): MutablePendingRequestWitness<Entry> {
    return {
        requestId: requestId as PendingRequestId,
        entry,
        released: false,
    };
}

function toMutableWitness<Entry extends object>(witness: PendingRequestWitness<Entry>): MutablePendingRequestWitness<Entry> {
    return witness as MutablePendingRequestWitness<Entry>;
}
