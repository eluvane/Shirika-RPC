import { describeCodec } from '../codec/signature.js';
import type { Codec } from '../codec/types.js';
import { MAX_METHOD_ID } from '../constants.js';
import { isFastPathEnabled } from '../fast-path-strategy.js';

const methodIdBrand: unique symbol = Symbol('shirika-rpc.methodId');
const contractWitnessBrand: unique symbol = Symbol('shirika-rpc.contractWitness');
const preparedContractBrand: unique symbol = Symbol('shirika-rpc.preparedContract');

interface MethodIdBrand {
    readonly [methodIdBrand]: true;
}

type MethodId = number & MethodIdBrand;

export interface MethodDef<Req, Res> {
    readonly id: number;
    readonly request: Codec<Req>;
    readonly response: Codec<Res>;
}
export type ContractShape = Record<string, MethodDef<unknown, unknown>>;
export type ContractInput<C extends ContractShape> = C | PreparedContract<C>;
export type MethodNames<C extends ContractShape> = Extract<keyof C, string>;
export type RequestOf<C extends ContractShape, K extends MethodNames<C>> = C[K] extends MethodDef<infer Req, unknown> ? Req : never;
export type ResponseOf<C extends ContractShape, K extends MethodNames<C>> = C[K] extends MethodDef<unknown, infer Res> ? Res : never;
export interface MethodIndexEntry<C extends ContractShape, K extends MethodNames<C> = MethodNames<C>> {
    readonly method: K;
    readonly def: C[K];
}
export interface ContractDescriptionEntry {
    readonly method: string;
    readonly id: number;
    readonly request: string;
    readonly response: string;
}
export interface PreparedContractMethod<C extends ContractShape, K extends MethodNames<C> = MethodNames<C>> {
    readonly method: K;
    readonly id: number;
    readonly def: C[K];
    readonly description: ContractDescriptionEntry;
}
export interface ContractWitness<C extends ContractShape> {
    readonly [contractWitnessBrand]: true;
    readonly methods: readonly PreparedContractMethod<C>[];
    readonly canonicalMethods: readonly PreparedContractMethod<C>[];
}
export interface PreparedContract<C extends ContractShape> {
    readonly [preparedContractBrand]: true;
    readonly contract: C;
    readonly witness: ContractWitness<C>;
    readonly description: readonly ContractDescriptionEntry[];
    readonly descriptionJson: string;
    readonly hash: string;
    readonly methodIndex: ReadonlyMap<number, MethodIndexEntry<C>>;
    readonly methodsByName: ReadonlyMap<string, PreparedContractMethod<C>>;
}

const preparedContractCache = new WeakMap<ContractShape, unknown>();
const preparedContractInstances = new WeakSet<object>();

export function method<Req, Res>(id: number, request: Codec<Req>, response: Codec<Res>): MethodDef<Req, Res> {
    const methodId = assertMethodId(id, 'Method id');
    return Object.freeze({ id: methodId, request, response });
}
export function defineContract<const C extends Record<string, MethodDef<unknown, unknown>>>(contract: C): C {
    const prepared = createPreparedContract(contract);
    Object.freeze(contract);
    if (isFastPathEnabled('preparedContractReuse')) {
        rememberPreparedContract(contract, prepared);
    }
    return contract;
}
export function prepareContract<C extends ContractShape>(contract: ContractInput<C>): PreparedContract<C> {
    return getPreparedContract(contract);
}
export function describeContract<C extends ContractShape>(contract: ContractInput<C>): ContractDescriptionEntry[] {
    return getPreparedContract(contract).description.map(cloneDescriptionEntry);
}
export function getContractHash<C extends ContractShape>(contract: ContractInput<C>): string {
    return getPreparedContract(contract).hash;
}
export function buildMethodIndex<C extends ContractShape>(contract: ContractInput<C>): Map<number, MethodIndexEntry<C>> {
    return new Map(getPreparedContract(contract).methodIndex);
}

function getPreparedContract<C extends ContractShape>(contract: ContractInput<C>): PreparedContract<C> {
    const reuseEnabled = isFastPathEnabled('preparedContractReuse');
    if (isPreparedContract(contract)) {
        return reuseEnabled ? contract : createPreparedContract(contract.contract);
    }
    if (reuseEnabled) {
        const cached = preparedContractCache.get(contract);
        if (cached) {
            return cached as PreparedContract<C>;
        }
    }
    const prepared = createPreparedContract(contract);
    if (reuseEnabled && Object.isFrozen(contract)) {
        rememberPreparedContract(contract, prepared);
    }
    return prepared;
}
function isPreparedContract<C extends ContractShape>(value: ContractInput<C>): value is PreparedContract<C> {
    return typeof value === 'object' && value !== null && preparedContractInstances.has(value);
}
function createPreparedContract<C extends ContractShape>(contract: C): PreparedContract<C> {
    const methodEntries: PreparedContractMethod<C>[] = [];
    const methodIndexEntries: Array<readonly [number, MethodIndexEntry<C>]> = [];
    const methodNameEntries: Array<readonly [string, PreparedContractMethod<C>]> = [];
    const seenIds = new Map<number, string>();
    for (const methodName of Object.keys(contract) as MethodNames<C>[]) {
        const def = contract[methodName];
        if (!def) {
            throw new TypeError(`Missing method definition for ${String(methodName)}`);
        }
        const id = assertMethodId(def.id, `Method id for ${String(methodName)}`);
        assertMethodIdIsUnique(seenIds, id, String(methodName));
        const description = freezeDescriptionEntry({
            method: methodName,
            id,
            request: describeCodec(def.request),
            response: describeCodec(def.response),
        });
        const preparedMethod = Object.freeze({
            method: methodName,
            id,
            def,
            description,
        });
        const indexEntry = Object.freeze({ method: methodName, def });
        methodEntries.push(preparedMethod);
        methodIndexEntries.push([id, indexEntry]);
        methodNameEntries.push([methodName, preparedMethod]);
    }
    const canonicalMethods = Object.freeze([...methodEntries].sort((left, right) => left.id - right.id || compareMethodNames(left.method, right.method)));
    const description = Object.freeze(canonicalMethods.map((entry) => entry.description));
    const witness: ContractWitness<C> = Object.freeze({
        [contractWitnessBrand]: true as const,
        methods: Object.freeze(methodEntries),
        canonicalMethods,
    });
    const descriptionJson = JSON.stringify(description);
    const prepared: PreparedContract<C> = Object.freeze({
        [preparedContractBrand]: true as const,
        contract,
        witness,
        description,
        descriptionJson,
        hash: hashContractDescriptionJson(descriptionJson),
        methodIndex: new ReadonlyMapView(methodIndexEntries),
        methodsByName: new ReadonlyMapView(methodNameEntries),
    });
    preparedContractInstances.add(prepared);
    return prepared;
}
function rememberPreparedContract<C extends ContractShape>(contract: C, prepared: PreparedContract<C>): void {
    preparedContractCache.set(contract, prepared);
}
function freezeDescriptionEntry(entry: ContractDescriptionEntry): ContractDescriptionEntry {
    return Object.freeze({ ...entry });
}
function cloneDescriptionEntry(entry: ContractDescriptionEntry): ContractDescriptionEntry {
    return { ...entry };
}
function hashContractDescriptionJson(description: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < description.length; index += 1) {
        hash ^= description.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `fnv1a32:${hash.toString(16).padStart(8, '0')}`;
}
function assertMethodId(id: number, label: string): MethodId {
    if (!Number.isInteger(id) || id <= 0 || id > MAX_METHOD_ID) {
        throw new TypeError(`${label} must be an integer in range 1..${MAX_METHOD_ID}, received ${id}`);
    }
    return id as MethodId;
}
function assertMethodIdIsUnique(seenIds: Map<number, string>, id: MethodId, methodName: string): void {
    const previous = seenIds.get(id);
    if (previous !== undefined) {
        throw new TypeError(`Duplicate method id ${id} detected for methods ${previous} and ${methodName}`);
    }
    seenIds.set(id, methodName);
}
function compareMethodNames(left: string, right: string): number {
    const length = Math.min(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
        const diff = left.charCodeAt(index) - right.charCodeAt(index);
        if (diff !== 0) {
            return diff;
        }
    }
    return left.length - right.length;
}

class ReadonlyMapView<K, V> implements ReadonlyMap<K, V> {
    readonly #map: Map<K, V>;
    public constructor(entries: Iterable<readonly [K, V]>) {
        this.#map = new Map(entries);
        Object.freeze(this);
    }
    public get size(): number {
        return this.#map.size;
    }
    public get [Symbol.toStringTag](): string {
        return 'ReadonlyMap';
    }
    public get(key: K): V | undefined {
        return this.#map.get(key);
    }
    public has(key: K): boolean {
        return this.#map.has(key);
    }
    public entries(): MapIterator<[K, V]> {
        return this.#map.entries();
    }
    public keys(): MapIterator<K> {
        return this.#map.keys();
    }
    public values(): MapIterator<V> {
        return this.#map.values();
    }
    public forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
        this.#map.forEach((value, key) => {
            callbackfn.call(thisArg, value, key, this);
        });
    }
    public [Symbol.iterator](): MapIterator<[K, V]> {
        return this.entries();
    }
}
