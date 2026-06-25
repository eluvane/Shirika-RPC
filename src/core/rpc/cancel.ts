import { createAbortError } from '../abort.js';
import { string, u8 } from '../codec/builtins.js';
import { optional, struct } from '../codec/combinators.js';
import { CancelCode } from '../constants.js';
import { ShirikaClosedError, ShirikaTimeoutError } from '../errors.js';
import { describeError } from '../utils.js';
export interface CancelPayload {
    readonly code: CancelCode;
    readonly message: string | undefined;
}
export const cancelPayloadCodec = struct({
    code: u8(),
    message: optional(string()),
});
export function createCancelPayload(code: CancelCode, reason: unknown): CancelPayload {
    const message = reason === undefined ? undefined : describeError(reason);
    return { code, message };
}
export function createCancelReason(payload: CancelPayload): unknown {
    switch (payload.code) {
        case CancelCode.TIMEOUT:
            return new ShirikaTimeoutError(payload.message ?? 'RPC request timed out');
        case CancelCode.CLIENT_CLOSE:
            return new ShirikaClosedError(payload.message ?? 'RPC client closed request');
        case CancelCode.CLIENT_ABORT:
            return createAbortError(payload.message ?? 'RPC request aborted');
        default:
            return createAbortError(payload.message ?? 'RPC request aborted');
    }
}
