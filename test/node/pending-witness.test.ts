import { describe, expect, test } from 'vitest';
import { PendingRequestStore, type PendingRequestWitness } from '../../dist/core/rpc/pending.js';
import { ShirikaProtocolError } from '../../dist/index.js';

interface TestPendingEntry {
    readonly label: string;
}

describe('internal pending request lifecycle witness', () => {
    test('allocation returns non-zero UInt32 ids and skips ids already pending', () => {
        const store = new PendingRequestStore<TestPendingEntry>();
        const occupied = { label: 'occupied' };
        store.insertAllocated(1, occupied);

        const requestId = store.allocateRequestId();
        expect(requestId).toBe(2);
        expect(requestId).toBeGreaterThan(0);
        expect(requestId).toBeLessThanOrEqual(0xffffffff);
    });

    test('allocation wraps around zero without returning request id zero', () => {
        const store = new PendingRequestStore<TestPendingEntry>(0xffffffff);
        expect(store.allocateRequestId()).toBe(0xffffffff);
        expect(store.allocateRequestId()).toBe(1);
    });

    test('witness is created only for an inserted pending entry', () => {
        const store = new PendingRequestStore<TestPendingEntry>();
        const entry = { label: 'inserted' };
        const witness = store.insertAllocated(7, entry);

        expect(witness.requestId).toBe(7);
        expect(witness.entry).toBe(entry);
        expect(store.has(witness.requestId)).toBe(true);
        expect(store.size).toBe(1);
    });

    test('invalid or duplicate ids cannot create a pending witness', () => {
        const store = new PendingRequestStore<TestPendingEntry>();
        const entry = { label: 'entry' };
        store.insertAllocated(9, entry);

        expect(() => store.insertAllocated(0, { label: 'zero' })).toThrow(ShirikaProtocolError);
        expect(() => store.insertAllocated(9, { label: 'duplicate' })).toThrow(ShirikaProtocolError);
    });

    test('releaseByWitness consumes the pending entry exactly once', () => {
        const store = new PendingRequestStore<TestPendingEntry>();
        const entry = { label: 'release-once' };
        const witness = store.insertAllocated(11, entry);

        expect(store.releaseByWitness(witness)).toEqual({ requestId: 11, entry });
        expect(store.releaseByWitness(witness)).toBeUndefined();
        expect(store.size).toBe(0);
    });

    test('releaseUntrusted handles inbound miss and marks duplicate witness release safely', () => {
        const store = new PendingRequestStore<TestPendingEntry>();
        const entry = { label: 'inbound' };
        const witness = store.insertAllocated(12, entry);

        expect(store.releaseUntrusted(99)).toBeUndefined();
        expect(store.releaseUntrusted(12)).toEqual({ requestId: 12, entry });
        expect(store.releaseByWitness(witness)).toBeUndefined();
        expect(store.size).toBe(0);
    });

    test('lookupUntrusted checks inbound ids without releasing or creating a witness', () => {
        const store = new PendingRequestStore<TestPendingEntry>();
        const entry = { label: 'lookup' };
        const witness = store.insertAllocated(13, entry);

        expect(store.lookupUntrusted(99)).toBeUndefined();
        expect(store.lookupUntrusted(13)).toEqual({ requestId: 13, entry });
        expect(store.size).toBe(1);
        expect(store.releaseByWitness(witness)).toEqual({ requestId: 13, entry });
        expect(store.size).toBe(0);
    });

    test('stale witness cannot release a new entry that reused the numeric id', () => {
        const store = new PendingRequestStore<TestPendingEntry>();
        const oldEntry = { label: 'old' };
        const newEntry = { label: 'new' };
        const oldWitness: PendingRequestWitness<TestPendingEntry> = store.insertAllocated(42, oldEntry);

        expect(store.releaseUntrusted(42)).toEqual({ requestId: 42, entry: oldEntry });
        const newWitness = store.insertAllocated(42, newEntry);

        expect(store.releaseByWitness(oldWitness)).toBeUndefined();
        expect(store.has(42)).toBe(true);
        expect(store.releaseByWitness(newWitness)).toEqual({ requestId: 42, entry: newEntry });
    });
});
