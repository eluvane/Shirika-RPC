import { describe, expect, test } from 'vitest';
import { createRemoteError, decodeRemoteErrorPayload, encodeRemoteErrorPayload, toRemoteErrorPayload } from '../../dist/index.js';

describe('remote error helpers', () => {
    test('plain-object thrown values preserve diagnostics and remain encodable', () => {
        const thrown = {
            name: 'PlainObjectError',
            message: 'boom',
            code: 'E_PLAIN',
            detail: { ok: true },
            retryable: false,
            values: [1, 2, 3],
        };
        const payload = toRemoteErrorPayload(thrown);
        expect(payload).toMatchObject({
            name: 'PlainObjectError',
            message: 'boom',
            code: 'E_PLAIN',
            data: {
                detail: { ok: true },
                retryable: false,
                values: [1, 2, 3],
            },
        });
        const decoded = decodeRemoteErrorPayload(encodeRemoteErrorPayload(thrown));
        expect(decoded).toMatchObject(payload);
    });
    test('circular diagnostic data is sanitized before encoding', () => {
        const data: {
            self?: unknown;
        } = {};
        data.self = data;
        const decoded = decodeRemoteErrorPayload(
            encodeRemoteErrorPayload({
                name: 'CircularError',
                message: 'boom',
                data,
            }),
        );
        expect(decoded).toMatchObject({
            name: 'CircularError',
            message: 'boom',
            data: {
                self: '[Circular]',
            },
        });
    });
    test('statusCode is exposed only for positive integer values', () => {
        expect(createRemoteError({ name: 'Error', message: 'boom' }, 503).statusCode).toBe(503);
        expect(createRemoteError({ name: 'Error', message: 'boom' }, 0).statusCode).toBeUndefined();
        expect(createRemoteError({ name: 'Error', message: 'boom' }, -1).statusCode).toBeUndefined();
        expect(createRemoteError({ name: 'Error', message: 'boom' }, 1.5).statusCode).toBeUndefined();
    });
});
