import { msgpack } from '../codec/msgpack.js';
import { ShirikaRemoteError, type ShirikaRemoteErrorInit } from '../errors.js';
import { describeError, isRecord } from '../utils.js';
export interface RemoteErrorPayload {
    readonly name: string;
    readonly message: string;
    readonly stack?: string;
    readonly code?: string | number;
    readonly data?: unknown;
}
const remoteErrorCodec = msgpack<RemoteErrorPayload>();
const REMOTE_ERROR_MAX_DEPTH = 5;
export function toRemoteErrorPayload(error: unknown): RemoteErrorPayload {
    if (error instanceof Error) {
        const withMetadata = error as Error & {
            code?: string | number;
            data?: unknown;
        };
        const payload: RemoteErrorPayload = {
            name: normalizeRemoteErrorName(error.name),
            message: normalizeRemoteErrorMessage(error.message, error),
        };
        if (error.stack !== undefined) {
            (
                payload as RemoteErrorPayload & {
                    stack: string;
                }
            ).stack = error.stack;
        }
        if (isRemoteErrorCode(withMetadata.code)) {
            (
                payload as RemoteErrorPayload & {
                    code: string | number;
                }
            ).code = withMetadata.code;
        }
        if (withMetadata.data !== undefined) {
            (
                payload as RemoteErrorPayload & {
                    data: unknown;
                }
            ).data = toTransportSafeValue(withMetadata.data);
        }
        return payload;
    }
    if (isRecord(error)) {
        const name = typeof error.name === 'string' ? error.name : 'Error';
        const message = typeof error.message === 'string' ? error.message : normalizeRemoteErrorMessage(describeError(error), error);
        const payload: RemoteErrorPayload = {
            name: normalizeRemoteErrorName(name),
            message,
        };
        if (typeof error.stack === 'string') {
            (
                payload as RemoteErrorPayload & {
                    stack: string;
                }
            ).stack = error.stack;
        }
        if (isRemoteErrorCode(error.code)) {
            (
                payload as RemoteErrorPayload & {
                    code: string | number;
                }
            ).code = error.code;
        }
        const recordData =
            error.data !== undefined
                ? toTransportSafeValue(error.data)
                : toTransportSafeRecord(error, new Set(['name', 'message', 'stack', 'code', 'statusCode']));
        if (recordData !== undefined) {
            (
                payload as RemoteErrorPayload & {
                    data: unknown;
                }
            ).data = recordData;
        }
        return payload;
    }
    return {
        name: 'Error',
        message: normalizeRemoteErrorMessage(describeError(error), error),
    };
}
export function encodeRemoteErrorPayload(error: unknown): Uint8Array {
    return remoteErrorCodec.encode(toRemoteErrorPayload(error));
}
export function decodeRemoteErrorPayload(bytes: Uint8Array): RemoteErrorPayload {
    return remoteErrorCodec.decode(bytes);
}
export function createRemoteError(payload: RemoteErrorPayload, statusCode?: number): ShirikaRemoteError {
    const init: ShirikaRemoteErrorInit = {
        remoteName: normalizeRemoteErrorName(payload.name),
        message: normalizeRemoteErrorMessage(payload.message, payload),
    };
    if (payload.stack !== undefined) {
        init.remoteStack = payload.stack;
    }
    if (payload.code !== undefined) {
        init.code = payload.code;
    }
    if (payload.data !== undefined) {
        init.data = payload.data;
    }
    const normalizedStatusCode = normalizeRemoteErrorStatusCode(statusCode);
    if (normalizedStatusCode !== undefined) {
        init.statusCode = normalizedStatusCode;
    }
    return new ShirikaRemoteError(init);
}
function normalizeRemoteErrorName(name: unknown): string {
    return typeof name === 'string' && name.length > 0 ? name : 'Error';
}
function normalizeRemoteErrorMessage(message: unknown, original: unknown): string {
    if (typeof message === 'string' && message.length > 0) {
        return message;
    }
    const description = describeError(original);
    return description && description !== '[object Object]' ? description : 'Unknown remote error';
}
function isRemoteErrorCode(value: unknown): value is string | number {
    return typeof value === 'string' || typeof value === 'number';
}
function normalizeRemoteErrorStatusCode(statusCode: number | undefined): number | undefined {
    return typeof statusCode === 'number' && Number.isInteger(statusCode) && statusCode > 0 ? statusCode : undefined;
}
function toTransportSafeRecord(value: Record<string, unknown>, omit: ReadonlySet<string>): Record<string, unknown> | undefined {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        if (omit.has(key)) {
            continue;
        }
        result[key] = toTransportSafeValue(item);
    }
    return Object.keys(result).length > 0 ? result : undefined;
}
function toTransportSafeValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
    if (value === null || value === undefined) {
        return value;
    }
    switch (typeof value) {
        case 'string':
        case 'number':
        case 'boolean':
            return value;
        case 'bigint':
            return value.toString();
        case 'symbol':
        case 'function':
            return String(value);
        case 'object':
            break;
        default:
            return describeError(value);
    }
    if (value instanceof Uint8Array) {
        return new Uint8Array(value);
    }
    if (ArrayBuffer.isView(value)) {
        const bytes = new Uint8Array(value.byteLength);
        bytes.set(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        return {
            type: value.constructor.name,
            data: bytes,
        };
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value.slice(0));
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (value instanceof Error) {
        return toRemoteErrorPayload(value);
    }
    if (Array.isArray(value)) {
        if (depth >= REMOTE_ERROR_MAX_DEPTH) {
            return value.map(() => '[Truncated]');
        }
        return value.map((item) => toTransportSafeValue(item, depth + 1, seen));
    }
    if (!isRecord(value)) {
        return describeError(value);
    }
    if (seen.has(value)) {
        return '[Circular]';
    }
    if (depth >= REMOTE_ERROR_MAX_DEPTH) {
        return '[Truncated]';
    }
    seen.add(value);
    try {
        const result: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value)) {
            result[key] = toTransportSafeValue(item, depth + 1, seen);
        }
        return Object.keys(result).length > 0 ? result : describeObject(value);
    } finally {
        seen.delete(value);
    }
}
function describeObject(value: object): string {
    const constructorName = value.constructor?.name;
    return constructorName && constructorName !== 'Object' ? constructorName : '[Object]';
}

export { remoteErrorCodec };
