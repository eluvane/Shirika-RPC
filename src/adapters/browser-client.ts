import { createBootstrapMessage, isErrorMessage, isReadyMessage } from '../core/bootstrap.js';
import { DEFAULT_CAPACITY_BYTES } from '../core/constants.js';
import { ShirikaEnvironmentError } from '../core/errors.js';
import { DuplexEndpoint } from '../core/ring/endpoint.js';
import { createRingBufferSab, createRingLayout } from '../core/ring/layout.js';
import { SharedRingBuffer } from '../core/ring/shared-ring.js';
import { createRpcClient } from '../core/rpc/client.js';
import { type ContractInput, type ContractShape, prepareContract } from '../core/rpc/contract.js';
import type { RpcClientControl, RpcTransportOptions } from '../core/rpc/types.js';
import { createWaitStrategy } from '../core/wait.js';
export interface BrowserWorkerRpcClientOptions extends RpcTransportOptions {
    readonly capacityBytes?: number;
    readonly bootstrapTimeoutMs?: number;
}
export async function createBrowserWorkerRpcClient<C extends ContractShape>(
    worker: Worker,
    contract: ContractInput<C>,
    options: BrowserWorkerRpcClientOptions = {},
): Promise<RpcClientControl<C>> {
    assertBrowserSabEnvironment();
    const capacityBytes = options.capacityBytes ?? DEFAULT_CAPACITY_BYTES;
    const clientToServerSab = createRingBufferSab(capacityBytes);
    const serverToClientSab = createRingBufferSab(capacityBytes);
    const bootstrapTimeoutMs = options.bootstrapTimeoutMs ?? 5000;
    const preparedContract = prepareContract(contract);
    const contractHash = preparedContract.hash;
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(new ShirikaEnvironmentError(`Timed out waiting for browser worker bootstrap after ${bootstrapTimeoutMs}ms`));
        }, bootstrapTimeoutMs);
        const onMessage = (event: MessageEvent<unknown>) => {
            if (isReadyMessage(event.data)) {
                if (event.data.contractHash !== contractHash) {
                    cleanup();
                    reject(
                        new ShirikaEnvironmentError(
                            `Browser worker bootstrap failed: RPC contract hash mismatch (expected ${contractHash}, received ${event.data.contractHash})`,
                        ),
                    );
                    return;
                }
                cleanup();
                resolve();
                return;
            }
            if (isErrorMessage(event.data)) {
                cleanup();
                reject(new ShirikaEnvironmentError(`Browser worker bootstrap failed: ${event.data.message}`));
            }
        };
        const onError = (event: ErrorEvent) => {
            cleanup();
            reject(createBrowserWorkerError('Browser worker error during bootstrap', event));
        };
        function cleanup(): void {
            clearTimeout(timeout);
            worker.removeEventListener('message', onMessage);
            worker.removeEventListener('error', onError);
        }
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage(createBootstrapMessage(capacityBytes, contractHash, clientToServerSab, serverToClientSab));
    });
    const endpoint = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(clientToServerSab, capacityBytes), createWaitStrategy(false), 'browser client -> worker'),
        inbound: new SharedRingBuffer(createRingLayout(serverToClientSab, capacityBytes), createWaitStrategy(false), 'browser worker -> client'),
    });
    const client = createRpcClient(preparedContract, endpoint, options);
    let runtimeListenersRemoved = false;
    const removeRuntimeListeners = (): void => {
        if (runtimeListenersRemoved) {
            return;
        }
        runtimeListenersRemoved = true;
        worker.removeEventListener('error', onRuntimeError);
        worker.removeEventListener('messageerror', onRuntimeMessageError);
    };
    const abort = (reason: unknown): void => {
        removeRuntimeListeners();
        void client.abort(reason);
    };
    const onRuntimeError = (event: ErrorEvent) => {
        abort(createBrowserWorkerError('Browser worker error', event));
    };
    const onRuntimeMessageError = () => {
        abort(new ShirikaEnvironmentError('Browser worker messageerror observed while receiving a control-plane message'));
    };
    worker.addEventListener('error', onRuntimeError);
    worker.addEventListener('messageerror', onRuntimeMessageError);
    const close = client.close.bind(client);
    const clientAbort = client.abort.bind(client);
    client.close = async () => {
        removeRuntimeListeners();
        return close();
    };
    client.abort = async (reason?: unknown) => {
        removeRuntimeListeners();
        return clientAbort(reason);
    };
    return client;
}
function createBrowserWorkerError(prefix: string, event: ErrorEvent): ShirikaEnvironmentError {
    const location = event.filename ? `${event.filename}${event.lineno || event.colno ? `:${event.lineno}:${event.colno}` : ''}` : undefined;
    const suffix = event.message ? `: ${event.message}` : '';
    const locationText = location ? ` (${location})` : '';
    return new ShirikaEnvironmentError(`${prefix}${locationText}${suffix}`, event.error instanceof Error ? { cause: event.error } : undefined);
}
function assertBrowserSabEnvironment(): void {
    const missingSab = typeof SharedArrayBuffer === 'undefined';
    const notSecure = typeof isSecureContext !== 'undefined' && !isSecureContext;
    const notIsolated = typeof crossOriginIsolated !== 'undefined' && !crossOriginIsolated;
    if (missingSab || notSecure || notIsolated) {
        throw new ShirikaEnvironmentError(
            'SharedArrayBuffer RPC in the browser requires a secure context and a cross-origin isolated page. Serve the page with COOP: same-origin and COEP: require-corp or credentialless, and do not block cross-origin-isolated via Permissions-Policy.',
        );
    }
}
