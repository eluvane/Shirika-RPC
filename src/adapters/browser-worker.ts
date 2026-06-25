import { createErrorMessage, createReadyMessage, isBootstrapLike, isBootstrapMessage } from '../core/bootstrap.js';
import { ShirikaEnvironmentError } from '../core/errors.js';
import { DuplexEndpoint } from '../core/ring/endpoint.js';
import { createRingLayout } from '../core/ring/layout.js';
import { SharedRingBuffer } from '../core/ring/shared-ring.js';
import { type ContractInput, type ContractShape, prepareContract } from '../core/rpc/contract.js';
import { createRpcServer } from '../core/rpc/server.js';
import type { RpcHandlers, RpcServer, RpcTransportOptions } from '../core/rpc/types.js';
import { describeError } from '../core/utils.js';
import { createWaitStrategy } from '../core/wait.js';
export interface BrowserWorkerRpcServerOptions<C extends ContractShape> extends RpcTransportOptions {
    readonly contract: ContractInput<C>;
    readonly handlers: RpcHandlers<C>;
    readonly selfRef?: DedicatedWorkerGlobalScope;
}
export function runBrowserWorkerRpcServer<C extends ContractShape>(options: BrowserWorkerRpcServerOptions<C>): Promise<RpcServer<C>> {
    // SAFETY: runtime shape validation below rejects non-worker globals before any worker-only method is used.
    const scope = options.selfRef ?? (globalThis as unknown as DedicatedWorkerGlobalScope);
    if (!scope || typeof scope.addEventListener !== 'function') {
        throw new ShirikaEnvironmentError('runBrowserWorkerRpcServer must be called inside a dedicated worker context');
    }
    return new Promise<RpcServer<C>>((resolve, reject) => {
        let bootstrapped = false;
        const preparedContract = prepareContract(options.contract);
        const contractHash = preparedContract.hash;
        const onMessage = (event: MessageEvent<unknown>) => {
            if (!isBootstrapLike(event.data)) {
                return;
            }
            scope.removeEventListener('message', onMessage);
            if (!isBootstrapMessage(event.data)) {
                const error = new ShirikaEnvironmentError('Invalid shirika-rpc bootstrap payload received in browser worker');
                scope.postMessage(createErrorMessage(error.message));
                reject(error);
                return;
            }
            if (bootstrapped) {
                return;
            }
            bootstrapped = true;
            if (event.data.contractHash !== contractHash) {
                const error = new ShirikaEnvironmentError(`RPC contract hash mismatch (expected ${contractHash}, received ${event.data.contractHash})`);
                scope.postMessage(createErrorMessage(error.message));
                reject(error);
                return;
            }
            try {
                const endpoint = new DuplexEndpoint({
                    inbound: new SharedRingBuffer(
                        createRingLayout(event.data.clientToServerSab, event.data.capacityBytes),
                        createWaitStrategy(false),
                        'browser main -> worker',
                    ),
                    outbound: new SharedRingBuffer(
                        createRingLayout(event.data.serverToClientSab, event.data.capacityBytes),
                        createWaitStrategy(false),
                        'browser worker -> main',
                    ),
                });
                const server = createRpcServer(preparedContract, options.handlers, endpoint, options);
                scope.postMessage(createReadyMessage(contractHash));
                void server.serve().catch((error: unknown) => {
                    scope.postMessage(createErrorMessage(describeError(error)));
                });
                resolve(server);
            } catch (error) {
                const message = describeError(error);
                scope.postMessage(createErrorMessage(message));
                reject(error instanceof Error ? error : new Error(message));
            }
        };
        scope.addEventListener('message', onMessage);
    });
}
