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
        const withMetadata = error as Error & { code?: string | number; data?: unknown };
        return {
            name: normalizeRemoteErrorName(error.name),
            message: normalizeRemoteErrorMessage(error.message, error),
            ...(error.stack !== undefined ? { stack: error.stack } : {}),
            ...(isRemoteErrorCode(withMetadata.code) ? { code: withMetadata.code } : {}),
            ...(withMetadata.data !== undefined ? { data: toTransportSafeValue(withMetadata.data) } : {}),
        };
    }
    if (isRecord(error)) {
        const data = error['data'];
        const name = error['name'];
        const message = error['message'];
        const stack = error['stack'];
        const code = error['code'];
        const recordData =
            data !== undefined ? toTransportSafeValue(data) : toTransportSafeRecord(error, new Set(['name', 'message', 'stack', 'code', 'statusCode']));
        return {
            name: normalizeRemoteErrorName(typeof name === 'string' ? name : 'Error'),
            message: typeof message === 'string' ? message : normalizeRemoteErrorMessage(describeError(error), error),
            ...(typeof stack === 'string' ? { stack } : {}),
            ...(isRemoteErrorCode(code) ? { code } : {}),
            ...(recordData !== undefined ? { data: recordData } : {}),
        };
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
    const normalizedStatusCode = typeof statusCode === 'number' && Number.isInteger(statusCode) && statusCode > 0 ? statusCode : undefined;
    const init: ShirikaRemoteErrorInit = {
        remoteName: normalizeRemoteErrorName(payload.name),
        message: normalizeRemoteErrorMessage(payload.message, payload),
        ...(payload.stack !== undefined ? { remoteStack: payload.stack } : {}),
        ...(payload.code !== undefined ? { code: payload.code } : {}),
        ...(payload.data !== undefined ? { data: payload.data } : {}),
        ...(normalizedStatusCode !== undefined ? { statusCode: normalizedStatusCode } : {}),
    };
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
        if (Object.keys(result).length > 0) {
            return result;
        }
        const constructorName = value.constructor?.name;
        return constructorName && constructorName !== 'Object' ? constructorName : '[Object]';
    } finally {
        seen.delete(value);
    }
}

export { remoteErrorCodec };
