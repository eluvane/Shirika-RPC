import { FRAME_VERSION } from './constants.js';
import { ShirikaEnvironmentError } from './errors.js';
import { isRecord } from './utils.js';

const BOOTSTRAP_TYPE = 'shirika-rpc/bootstrap';
const READY_TYPE = 'shirika-rpc/ready';
const ERROR_TYPE = 'shirika-rpc/error';

export interface ShirikaBootstrapMessage {
    readonly type: typeof BOOTSTRAP_TYPE;
    readonly version: 1;
    readonly capacityBytes: number;
    readonly contractHash: string;
    readonly clientToServerSab: SharedArrayBuffer;
    readonly serverToClientSab: SharedArrayBuffer;
}

export interface ShirikaReadyMessage {
    readonly type: typeof READY_TYPE;
    readonly version: 1;
    readonly contractHash: string;
}

export interface ShirikaErrorMessage {
    readonly type: typeof ERROR_TYPE;
    readonly message: string;
}

export type ShirikaControlMessage = ShirikaBootstrapMessage | ShirikaReadyMessage | ShirikaErrorMessage;

export function createBootstrapMessage(
    capacityBytes: number,
    contractHash: string,
    clientToServerSab: SharedArrayBuffer,
    serverToClientSab: SharedArrayBuffer,
): ShirikaBootstrapMessage {
    return {
        type: BOOTSTRAP_TYPE,
        version: FRAME_VERSION,
        capacityBytes,
        contractHash,
        clientToServerSab,
        serverToClientSab,
    };
}

export function createReadyMessage(contractHash: string): ShirikaReadyMessage {
    return {
        type: READY_TYPE,
        version: FRAME_VERSION,
        contractHash,
    };
}

export function createErrorMessage(message: string): ShirikaErrorMessage {
    return {
        type: ERROR_TYPE,
        message,
    };
}

export function isBootstrapMessage(value: unknown): value is ShirikaBootstrapMessage {
    return (
        isRecord(value) &&
        value['type'] === BOOTSTRAP_TYPE &&
        value['version'] === FRAME_VERSION &&
        typeof value['capacityBytes'] === 'number' &&
        typeof value['contractHash'] === 'string' &&
        value['clientToServerSab'] instanceof SharedArrayBuffer &&
        value['serverToClientSab'] instanceof SharedArrayBuffer
    );
}

export function isReadyMessage(value: unknown): value is ShirikaReadyMessage {
    return isRecord(value) && value['type'] === READY_TYPE && value['version'] === FRAME_VERSION && typeof value['contractHash'] === 'string';
}

export function isErrorMessage(value: unknown): value is ShirikaErrorMessage {
    return isRecord(value) && value['type'] === ERROR_TYPE && typeof value['message'] === 'string';
}

export function isBootstrapLike(value: unknown): value is { type: typeof BOOTSTRAP_TYPE } {
    return isRecord(value) && value['type'] === BOOTSTRAP_TYPE;
}

export type BootstrapAcceptResult =
    { readonly ok: true; readonly message: ShirikaBootstrapMessage } | { readonly ok: false; readonly error: ShirikaEnvironmentError };

export function acceptBootstrapMessage(value: unknown, expectedContractHash: string, invalidPayloadMessage: string): BootstrapAcceptResult {
    if (!isBootstrapMessage(value)) {
        return { ok: false, error: new ShirikaEnvironmentError(invalidPayloadMessage) };
    }
    if (value.contractHash !== expectedContractHash) {
        return {
            ok: false,
            error: new ShirikaEnvironmentError(contractHashMismatchMessage(expectedContractHash, value.contractHash)),
        };
    }
    return { ok: true, message: value };
}

export type ReadyHandshakeResult =
    { readonly kind: 'ready' } | { readonly kind: 'error'; readonly error: ShirikaEnvironmentError } | { readonly kind: 'ignore' };

export function interpretReadyHandshake(value: unknown, expectedContractHash: string, labels: { readonly platform: string }): ReadyHandshakeResult {
    if (isReadyMessage(value)) {
        if (value.contractHash !== expectedContractHash) {
            return {
                kind: 'error',
                error: new ShirikaEnvironmentError(
                    `${labels.platform} worker bootstrap failed: ${contractHashMismatchMessage(expectedContractHash, value.contractHash)}`,
                ),
            };
        }
        return { kind: 'ready' };
    }
    if (isErrorMessage(value)) {
        return {
            kind: 'error',
            error: new ShirikaEnvironmentError(`${labels.platform} worker bootstrap failed: ${value.message}`),
        };
    }
    return { kind: 'ignore' };
}

function contractHashMismatchMessage(expected: string, received: string): string {
    return `RPC contract hash mismatch (expected ${expected}, received ${received})`;
}
