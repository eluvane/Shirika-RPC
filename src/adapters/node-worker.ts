import type { MessagePort } from 'node:worker_threads';
import { acceptBootstrapMessage, createErrorMessage, createReadyMessage, isBootstrapLike } from '../core/bootstrap.js';
import { ShirikaEnvironmentError } from '../core/errors.js';
import { DuplexEndpoint } from '../core/ring/endpoint.js';
import { createRingLayout } from '../core/ring/layout.js';
import { SharedRingBuffer } from '../core/ring/shared-ring.js';
import { type ContractInput, type ContractShape, prepareContract } from '../core/rpc/contract.js';
import { createRpcServer } from '../core/rpc/server.js';
import type { RpcHandlers, RpcServer, RpcTransportOptions } from '../core/rpc/types.js';
import { describeError } from '../core/utils.js';
import { createWaitStrategy } from '../core/wait.js';

export interface NodeWorkerRpcServerOptions<C extends ContractShape> extends RpcTransportOptions {
    readonly contract: ContractInput<C>;
    readonly handlers: RpcHandlers<C>;
    readonly parentPortRef?: MessagePort | null;
}

export function runNodeWorkerRpcServer<C extends ContractShape>(options: NodeWorkerRpcServerOptions<C>): Promise<RpcServer<C>> {
    const port = options.parentPortRef;
    if (!port) {
        throw new ShirikaEnvironmentError('runNodeWorkerRpcServer requires parentPort inside a worker thread');
    }
    return new Promise<RpcServer<C>>((resolve, reject) => {
        let bootstrapped = false;
        const preparedContract = prepareContract(options.contract);
        const contractHash = preparedContract.hash;
        const onMessage = (message: unknown) => {
            if (!isBootstrapLike(message)) {
                return;
            }
            port.off('message', onMessage);
            if (bootstrapped) {
                return;
            }
            bootstrapped = true;
            const accepted = acceptBootstrapMessage(message, contractHash, 'Invalid shirika-rpc bootstrap payload received in node worker');
            if (!accepted.ok) {
                port.postMessage(createErrorMessage(accepted.error.message));
                reject(accepted.error);
                return;
            }
            try {
                const endpoint = new DuplexEndpoint({
                    inbound: new SharedRingBuffer(
                        createRingLayout(accepted.message.clientToServerSab, accepted.message.capacityBytes),
                        createWaitStrategy(false),
                        'node main -> worker',
                    ),
                    outbound: new SharedRingBuffer(
                        createRingLayout(accepted.message.serverToClientSab, accepted.message.capacityBytes),
                        createWaitStrategy(false),
                        'node worker -> main',
                    ),
                });
                const keepAlive = setInterval(() => undefined, 0x7fffffff);
                const stopKeepAlive = () => {
                    clearInterval(keepAlive);
                };
                const server = createRpcServer(preparedContract, options.handlers, endpoint, options);
                const close = server.close.bind(server);
                server.close = async (reason?: unknown) => {
                    stopKeepAlive();
                    return close(reason);
                };
                port.postMessage(createReadyMessage(contractHash));
                void server
                    .serve()
                    .catch((error: unknown) => {
                        stopKeepAlive();
                        port.postMessage(createErrorMessage(describeError(error)));
                    })
                    .finally(() => {
                        stopKeepAlive();
                    });
                resolve(server);
            } catch (error) {
                const messageText = describeError(error);
                port.postMessage(createErrorMessage(messageText));
                reject(error instanceof Error ? error : new Error(messageText));
            }
        };
        port.on('message', onMessage);
    });
}
