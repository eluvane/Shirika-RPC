import { isFastPathEnabled } from '../fast-path-strategy.js';
import type { SharedRingBuffer } from '../ring/shared-ring.js';
import { describeCodec } from './signature.js';
import type { BinaryCodec, BinaryReader, BinaryWriter } from './types.js';

const codecWitnessBrand: unique symbol = Symbol('shirika-rpc.codecWitness');
const preparedBinaryCodecBrand: unique symbol = Symbol('shirika-rpc.preparedBinaryCodec');
const validatedEncodedPayloadBrand: unique symbol = Symbol('shirika-rpc.validatedEncodedPayload');

export type CodecWitnessKind = 'primitive' | 'bytes' | 'optional' | 'array' | 'tuple' | 'struct';
export type CodecWitnessValueScope = 'all-values' | 'bounded-primitive-values' | 'small-length-prefix-values';

export interface CodecWitnessComponent {
    readonly signature: string;
    readonly leanCodec: string;
    readonly leanTheorems: readonly string[];
}

export interface CodecWitness<_T> {
    readonly kind: 'binary';
    readonly codecKind: CodecWitnessKind;
    readonly signature: string;
    readonly leanCodec: string;
    readonly leanTheorems: readonly string[];
    readonly conformanceVectors: readonly string[];
    readonly valueScope: CodecWitnessValueScope;
    readonly measuredWriterFastPath: boolean;
    readonly readSideValidation: boolean;
    readonly readSideStrategyId: string | undefined;
    readonly components: readonly CodecWitnessComponent[];
}

export interface PreparedBinaryCodec<T> extends BinaryCodec<T> {
    readonly codec: BinaryCodec<T>;
    readonly witness: CodecWitness<T>;
}

export interface InternalMeasuredWriterStrategy {
    readonly id: string;
    readonly conformanceVectors: readonly string[];
    readonly measure: (value: unknown) => number | undefined;
    readonly write: (writer: BinaryWriter, value: unknown, expectedPayloadLength: number) => void;
}

export interface EncodedPayloadRange {
    readonly payloadSeq: number;
    readonly payloadLength: number;
}

export interface ValidatedEncodedPayload<T> extends EncodedPayloadRange {
    readonly codec: PreparedBinaryCodec<T>;
    readonly signature: string;
    readonly strategyId: string;
    readonly conformanceVectors: readonly string[];
    readonly value: T;
}

export interface ValidatedEncodedPayloadDecode<T> {
    readonly witness: ValidatedEncodedPayload<T>;
    readonly value: T;
}

export interface InternalReadSideStrategy<T = unknown> {
    readonly id: string;
    readonly conformanceVectors: readonly string[];

    readonly validateAndDecode: (ring: SharedRingBuffer, range: EncodedPayloadRange) => T;
}

export interface PreparedMeasuredWriterSelection {
    readonly strategy: InternalMeasuredWriterStrategy | undefined;
    readonly strategyId: string;
    readonly payloadLength: number;
}

interface CodecWitnessDefinition<T> {
    readonly codecKind: CodecWitnessKind;
    readonly signature: string;
    readonly leanCodec: string;
    readonly leanTheorems: readonly string[];
    readonly conformanceVectors: readonly string[];
    readonly valueScope?: CodecWitnessValueScope;
    readonly measuredWriterFastPath?: boolean;
    readonly components?: readonly CodecWitnessComponent[];
    readonly acceptsMeasuredWriterValue?: (value: T) => boolean;
    readonly specializedMeasuredWriter?: InternalMeasuredWriterStrategy | undefined;
    readonly readSideStrategy?: InternalReadSideStrategy | undefined;
}

interface InternalCodecWitness<T> extends CodecWitness<T> {
    readonly acceptsMeasuredWriterValue: (value: T) => boolean;
    readonly specializedMeasuredWriter: InternalMeasuredWriterStrategy | undefined;
    readonly readSideStrategy: InternalReadSideStrategy | undefined;
}

const internalCodecWitnesses = new WeakMap<BinaryCodec<unknown>, InternalCodecWitness<unknown>>();
const preparedInternalCodecWitnesses = new WeakMap<PreparedBinaryCodec<unknown>, InternalCodecWitness<unknown>>();
const preparedBinaryCodecCache = new WeakMap<BinaryCodec<unknown>, PreparedBinaryCodec<unknown>>();

export function defineInternalCodecWitness<T>(codec: BinaryCodec<T>, definition: CodecWitnessDefinition<T>): BinaryCodec<T> {
    const measuredWriterFastPath = definition.measuredWriterFastPath ?? true;
    const signature = describeCodec(codec);
    if (signature !== definition.signature) {
        throw new TypeError(`Codec witness signature mismatch: expected ${definition.signature}, received ${signature}`);
    }
    if (measuredWriterFastPath && isCompositeCodecKind(definition.codecKind) && definition.specializedMeasuredWriter === undefined) {
        throw new TypeError(`Composite codec ${signature} cannot enable the measured writer fast path without a specialized writer strategy`);
    }
    if (definition.specializedMeasuredWriter !== undefined) {
        assertStrategyCoveredByWitness(
            'Specialized writer',
            definition.specializedMeasuredWriter.id,
            definition.specializedMeasuredWriter.conformanceVectors,
            definition.conformanceVectors,
            signature,
        );
    }
    if (definition.readSideStrategy !== undefined) {
        assertStrategyCoveredByWitness(
            'Read-side strategy',
            definition.readSideStrategy.id,
            definition.readSideStrategy.conformanceVectors,
            definition.conformanceVectors,
            signature,
        );
    }
    const witness: InternalCodecWitness<T> = Object.freeze({
        [codecWitnessBrand]: true as const,
        kind: 'binary' as const,
        codecKind: definition.codecKind,
        signature: definition.signature,
        leanCodec: definition.leanCodec,
        leanTheorems: Object.freeze([...definition.leanTheorems]),
        conformanceVectors: Object.freeze([...definition.conformanceVectors]),
        valueScope: definition.valueScope ?? 'all-values',
        measuredWriterFastPath,
        readSideValidation: definition.readSideStrategy !== undefined,
        readSideStrategyId: definition.readSideStrategy?.id,
        components: Object.freeze([...(definition.components ?? [])]),
        acceptsMeasuredWriterValue: definition.acceptsMeasuredWriterValue ?? (() => true),
        specializedMeasuredWriter: definition.specializedMeasuredWriter,
        readSideStrategy: definition.readSideStrategy,
    });
    internalCodecWitnesses.set(codec as BinaryCodec<unknown>, witness as InternalCodecWitness<unknown>);
    Object.freeze(codec);
    return codec;
}

export function prepareBinaryCodec<T>(codec: BinaryCodec<T> | PreparedBinaryCodec<T>): PreparedBinaryCodec<T> | undefined {
    if (isPreparedBinaryCodec(codec)) {
        return codec;
    }
    const existing = preparedBinaryCodecCache.get(codec as BinaryCodec<unknown>);
    if (existing !== undefined) {
        return existing as PreparedBinaryCodec<T>;
    }
    const witness = readInternalCodecWitness(codec);
    if (witness === undefined) {
        return undefined;
    }
    if (describeCodec(codec) !== witness.signature) {
        return undefined;
    }
    const prepared = {
        [preparedBinaryCodecBrand]: true as const,
        kind: 'binary' as const,
        codec,
        witness: publicCodecWitness(witness),
        measure(value: T) {
            return codec.measure(value);
        },
        write(writer: BinaryWriter, value: T) {
            codec.write(writer, value);
        },
        read(reader: BinaryReader) {
            return codec.read(reader);
        },
    } as PreparedBinaryCodec<T>;
    preparedInternalCodecWitnesses.set(prepared as PreparedBinaryCodec<unknown>, witness as InternalCodecWitness<unknown>);
    Object.freeze(prepared);
    preparedBinaryCodecCache.set(codec as BinaryCodec<unknown>, prepared as PreparedBinaryCodec<unknown>);
    return prepared;
}

export function isPreparedBinaryCodec<T>(value: BinaryCodec<T> | PreparedBinaryCodec<T>): value is PreparedBinaryCodec<T> {
    return typeof value === 'object' && value !== null && preparedInternalCodecWitnesses.has(value as PreparedBinaryCodec<unknown>);
}

export function hasMeasuredWriterFastPathWitness<T>(codec: BinaryCodec<T> | PreparedBinaryCodec<T>): boolean {
    if (isPreparedBinaryCodec(codec)) {
        return codec.witness.measuredWriterFastPath;
    }
    return readInternalCodecWitness(codec)?.measuredWriterFastPath === true;
}

export function hasReadSideValidationWitness<T>(codec: BinaryCodec<T> | PreparedBinaryCodec<T>): boolean {
    if (isPreparedBinaryCodec(codec)) {
        return codec.witness.readSideValidation;
    }
    return readInternalCodecWitness(codec)?.readSideStrategy !== undefined;
}

export function isMeasuredWriterValueInScope<T>(prepared: PreparedBinaryCodec<T>, value: T): boolean {
    const witness = readPreparedInternalCodecWitness(prepared);
    if (witness === undefined || !witness.measuredWriterFastPath || !isFastPathEnabled('preparedBinaryCodecWriter')) {
        return false;
    }
    if (witness.specializedMeasuredWriter !== undefined) {
        return isFastPathEnabled('specializedCompositeWriter') && witness.specializedMeasuredWriter.measure(value) !== undefined;
    }
    return witness.acceptsMeasuredWriterValue(value);
}

export function selectPreparedMeasuredWriter<T>(prepared: PreparedBinaryCodec<T>, value: T): PreparedMeasuredWriterSelection | undefined {
    const witness = readPreparedInternalCodecWitness(prepared);
    if (witness === undefined || !witness.measuredWriterFastPath || !isFastPathEnabled('preparedBinaryCodecWriter')) {
        return undefined;
    }
    if (witness.specializedMeasuredWriter !== undefined) {
        if (!isFastPathEnabled('specializedCompositeWriter')) {
            return undefined;
        }
        const payloadLength = witness.specializedMeasuredWriter.measure(value);
        if (payloadLength === undefined) {
            return undefined;
        }
        return {
            strategy: witness.specializedMeasuredWriter,
            strategyId: witness.specializedMeasuredWriter.id,
            payloadLength,
        };
    }
    if (witness.codecKind !== 'primitive' && witness.codecKind !== 'bytes') {
        return undefined;
    }
    if (!witness.acceptsMeasuredWriterValue(value)) {
        return undefined;
    }
    return {
        strategy: undefined,
        strategyId: `${witness.codecKind}-measured-writer`,
        payloadLength: prepared.codec.measure(value),
    };
}

export function validateAndDecodePreparedEncodedPayload<T>(
    prepared: PreparedBinaryCodec<T>,
    ring: SharedRingBuffer,
    range: EncodedPayloadRange,
): ValidatedEncodedPayloadDecode<T> | undefined {
    const witness = readPreparedInternalCodecWitness(prepared);
    const strategy = witness?.readSideStrategy;
    if (witness === undefined || strategy === undefined || !isFastPathEnabled('readSideEncodedPayload')) {
        return undefined;
    }
    const value = strategy.validateAndDecode(ring, range) as T;
    const encodedPayload = Object.freeze({
        [validatedEncodedPayloadBrand]: true as const,
        codec: prepared,
        signature: witness.signature,
        strategyId: strategy.id,
        conformanceVectors: Object.freeze([...strategy.conformanceVectors]),
        payloadSeq: range.payloadSeq,
        payloadLength: range.payloadLength,
        value,
    }) satisfies ValidatedEncodedPayload<T>;
    return Object.freeze({
        witness: encodedPayload,
        value,
    });
}

export function codecWitnessComponent(witness: CodecWitness<unknown>): CodecWitnessComponent {
    return cloneCodecWitnessComponent(witness);
}

export function readCodecWitness<T>(codec: BinaryCodec<T> | PreparedBinaryCodec<T>): CodecWitness<T> | undefined {
    if (isPreparedBinaryCodec(codec)) {
        return codec.witness;
    }
    const witness = readInternalCodecWitness(codec);
    return witness === undefined ? undefined : publicCodecWitness(witness);
}

function assertStrategyCoveredByWitness(
    label: string,
    strategyId: string,
    strategyVectors: readonly string[],
    witnessVectors: readonly string[],
    signature: string,
): void {
    if (strategyVectors.length === 0) {
        throw new TypeError(`${label} ${strategyId} must name at least one conformance vector`);
    }
    const coveredByWitness = strategyVectors.every((vector) => witnessVectors.includes(vector));
    if (!coveredByWitness) {
        throw new TypeError(`${label} ${strategyId} is not covered by witness vectors for ${signature}`);
    }
}

function isCompositeCodecKind(codecKind: CodecWitnessKind): boolean {
    return codecKind === 'optional' || codecKind === 'array' || codecKind === 'tuple' || codecKind === 'struct';
}

function cloneCodecWitnessComponent(component: CodecWitnessComponent): CodecWitnessComponent {
    return Object.freeze({
        signature: component.signature,
        leanCodec: component.leanCodec,
        leanTheorems: Object.freeze([...component.leanTheorems]),
    });
}

function readInternalCodecWitness<T>(codec: BinaryCodec<T>): InternalCodecWitness<T> | undefined {
    return internalCodecWitnesses.get(codec as BinaryCodec<unknown>) as InternalCodecWitness<T> | undefined;
}

function readPreparedInternalCodecWitness<T>(prepared: PreparedBinaryCodec<T>): InternalCodecWitness<T> | undefined {
    return preparedInternalCodecWitnesses.get(prepared as PreparedBinaryCodec<unknown>) as InternalCodecWitness<T> | undefined;
}

function publicCodecWitness<T>(witness: InternalCodecWitness<T>): CodecWitness<T> {
    return Object.freeze({
        [codecWitnessBrand]: true as const,
        kind: witness.kind,
        codecKind: witness.codecKind,
        signature: witness.signature,
        leanCodec: witness.leanCodec,
        leanTheorems: Object.freeze([...witness.leanTheorems]),
        conformanceVectors: Object.freeze([...witness.conformanceVectors]),
        valueScope: witness.valueScope,
        measuredWriterFastPath: witness.measuredWriterFastPath,
        readSideValidation: witness.readSideValidation,
        readSideStrategyId: witness.readSideStrategyId,
        components: Object.freeze(witness.components.map((component) => cloneCodecWitnessComponent(component))),
    });
}
