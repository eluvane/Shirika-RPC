import { describe, expect, test } from 'vitest';
import { msgpack } from '../../dist/index.js';

describe('msgpack codec', () => {
    test('rejects declared array lengths that exceed the remaining payload before allocation', () => {
        const codec = msgpack<unknown>();
        const payload = new Uint8Array([0xdd, 0xff, 0xff, 0xff, 0xff]);

        expect(() => codec.decode(payload)).toThrow(RangeError);
    });

    test('rejects declared map lengths that exceed the remaining payload before iteration', () => {
        const codec = msgpack<unknown>();
        const payload = new Uint8Array([0xdf, 0xff, 0xff, 0xff, 0xff]);

        expect(() => codec.decode(payload)).toThrow(RangeError);
    });
});
