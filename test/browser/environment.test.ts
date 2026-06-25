import { describe, expect, test } from 'vitest';

describe('browser environment', () => {
    test('SharedArrayBuffer available', () => {
        expect(typeof SharedArrayBuffer).toBe('function');
    });
    test('crossOriginIsolated === true', () => {
        expect(globalThis.crossOriginIsolated).toBe(true);
    });
});
