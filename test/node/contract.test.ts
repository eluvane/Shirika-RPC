import { describe, expect, test } from 'vitest';
import { buildMethodIndex, codecs, defineContract, describeContract, getContractHash, MAX_METHOD_ID, method, prepareContract } from '../../dist/index.js';

describe('contract helpers', () => {
    test('prepareContract captures one-method description, index, and hash as a witness', () => {
        const contract = defineContract({
            echo: method(1, codecs.string(), codecs.string()),
        });
        const prepared = prepareContract(contract);
        expect(prepareContract(prepared)).toBe(prepared);
        expect(prepared.description).toEqual([{ method: 'echo', id: 1, request: 'string', response: 'string' }]);
        expect(prepared.descriptionJson).toBe('[{"method":"echo","id":1,"request":"string","response":"string"}]');
        expect(prepared.hash).toBe('fnv1a32:4f97c9cb');
        expect(prepared.methodIndex.get(1)).toMatchObject({ method: 'echo', def: contract.echo });
        expect(prepared.methodsByName.get('echo')?.id).toBe(1);
        expect(Object.isFrozen(prepared.description)).toBe(true);
        expect(Object.isFrozen(prepared.witness.canonicalMethods)).toBe(true);
    });
    test('prepared contract preserves stable cached description and hash behind safe copies', () => {
        const contract = defineContract({
            echo: method(1, codecs.string(), codecs.string()),
            sum: method(2, codecs.tuple([codecs.u32(), codecs.u32()]), codecs.u32()),
        });
        const prepared = prepareContract(contract);
        const publicDescription = describeContract(prepared);
        publicDescription.push({ method: 'mutated', id: 3, request: 'void', response: 'void' });
        const publicIndex = buildMethodIndex(prepared);
        publicIndex.clear();
        expect(describeContract(prepared)).toEqual(prepared.description);
        expect(getContractHash(prepared)).toBe(prepared.hash);
        expect(prepared.methodIndex.get(1)?.method).toBe('echo');
        expect(prepared.methodIndex.get(2)?.method).toBe('sum');
        expect('set' in prepared.methodIndex).toBe(false);
    });
    test('observable prepared-contract brand symbol does not authorize forged contracts', () => {
        const contract = defineContract({
            echo: method(1, codecs.string(), codecs.string()),
        });
        const prepared = prepareContract(contract);
        const forged = {
            forged: {
                id: 0,
                request: codecs.void(),
                response: codecs.void(),
            },
        } as Record<PropertyKey, unknown>;
        for (const symbol of Object.getOwnPropertySymbols(prepared)) {
            forged[symbol] = true;
        }
        expect(Object.getOwnPropertySymbols(prepared).length).toBeGreaterThan(0);
        expect(() => describeContract(forged as never)).toThrow(/1\.\./);
        expect(() => getContractHash(forged as never)).toThrow(/1\.\./);
        expect(() => prepareContract(forged as never)).toThrow(/1\.\./);
    });
    test('defineContract reports both method names for duplicate ids', () => {
        expect(() =>
            defineContract({
                first: method(1, codecs.string(), codecs.string()),
                second: method(1, codecs.string(), codecs.string()),
            }),
        ).toThrow(/Duplicate method id 1 detected for methods first and second/);
    });
    test('buildMethodIndex rejects duplicate ids even for unchecked contract objects', () => {
        const contract = {
            first: method(1, codecs.string(), codecs.string()),
            second: method(1, codecs.string(), codecs.string()),
        };
        expect(() => buildMethodIndex(contract)).toThrow(/Duplicate method id 1 detected for methods first and second/);
        expect(() => prepareContract(contract)).toThrow(/Duplicate method id 1 detected for methods first and second/);
    });
    test('description and hash reject duplicate ids for unchecked contract objects', () => {
        const contract = {
            first: method(1, codecs.string(), codecs.string()),
            second: method(1, codecs.string(), codecs.string()),
        };
        expect(() => describeContract(contract)).toThrow(/Duplicate method id 1 detected for methods first and second/);
        expect(() => getContractHash(contract)).toThrow(/Duplicate method id 1 detected for methods first and second/);
    });
    test('unchecked contract method ids must stay inside positive UInt32 range', () => {
        const contract = {
            tooLarge: {
                id: MAX_METHOD_ID + 1,
                request: codecs.void(),
                response: codecs.void(),
            },
        };
        expect(() => defineContract(contract)).toThrow(/1\.\./);
        expect(() => describeContract(contract)).toThrow(/1\.\./);
        expect(() => getContractHash(contract)).toThrow(/1\.\./);
        expect(() => buildMethodIndex(contract)).toThrow(/1\.\./);
        expect(() => prepareContract(contract)).toThrow(/1\.\./);
    });
    test('unchecked contract method id zero is rejected below the positive contract range', () => {
        const contract = {
            zero: {
                id: 0,
                request: codecs.void(),
                response: codecs.void(),
            },
        };
        expect(() => defineContract(contract)).toThrow(/1\.\./);
        expect(() => describeContract(contract)).toThrow(/1\.\./);
        expect(() => getContractHash(contract)).toThrow(/1\.\./);
        expect(() => buildMethodIndex(contract)).toThrow(/1\.\./);
        expect(() => prepareContract(contract)).toThrow(/1\.\./);
    });
    test('canonical description and hash are independent of contract insertion order', () => {
        const nestedRequest = codecs.struct({
            tag: codecs.u8(),
            maybePayload: codecs.optional(codecs.bytes()),
            pairs: codecs.array(codecs.tuple([codecs.bool(), codecs.u8()])),
        });
        const nestedResponse = codecs.tuple([codecs.bool(), codecs.u16()]);
        const first = defineContract({
            processNested: method(7, nestedRequest, nestedResponse),
            echo: method(1, codecs.string(), codecs.string()),
            sum: method(2, codecs.tuple([codecs.u32(), codecs.u32()]), codecs.u32()),
        });
        const second = defineContract({
            sum: method(2, codecs.tuple([codecs.u32(), codecs.u32()]), codecs.u32()),
            processNested: method(7, nestedRequest, nestedResponse),
            echo: method(1, codecs.string(), codecs.string()),
        });
        expect(describeContract(first)).toEqual(describeContract(second));
        expect(getContractHash(first)).toBe(getContractHash(second));
        expect(getContractHash(first)).toBe('fnv1a32:f4228de3');
    });
    test('boundary method id 0xffffffff is accepted without truncation', () => {
        const contract = defineContract({
            maxMethod: method(MAX_METHOD_ID, codecs.void(), codecs.void()),
        });
        expect(describeContract(contract)).toEqual([
            {
                method: 'maxMethod',
                id: MAX_METHOD_ID,
                request: 'void',
                response: 'void',
            },
        ]);
        expect(getContractHash(contract)).toBe('fnv1a32:ed306561');
    });
});
