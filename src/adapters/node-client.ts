import type { Worker } from 'node:worker_threads';
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
export interface NodeWorkerCrashContext {
    readonly phase: 'bootstrap' | 'runtime';
    readonly kind: 'error' | 'exit';
    readonly worker: Worker;
    readonly error?: Error;
    readonly exitCode?: number;
}
export type NodeWorkerCrashErrorFactory = (context: NodeWorkerCrashContext) => Error;
export interface NodeWorkerRpcClientOptions extends RpcTransportOptions {
    readonly capacityBytes?: number;
    readonly bootstrapTimeoutMs?: number;
    readonly bindWorkerLifecycle?: boolean;
    readonly workerCrashErrorFactory?: NodeWorkerCrashErrorFactory;
}
export async function createNodeWorkerRpcClient<C extends ContractShape>(
    worker: Worker,
    contract: ContractInput<C>,
    options: NodeWorkerRpcClientOptions = {},
): Promise<RpcClientControl<C>> {
    const capacityBytes = options.capacityBytes ?? DEFAULT_CAPACITY_BYTES;
    const clientToServerSab = createRingBufferSab(capacityBytes);
    const serverToClientSab = createRingBufferSab(capacityBytes);
    const bootstrapTimeoutMs = options.bootstrapTimeoutMs ?? 5000;
    const preparedContract = prepareContract(contract);
    const contractHash = preparedContract.hash;
    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(new ShirikaEnvironmentError(`Timed out waiting for node worker bootstrap after ${bootstrapTimeoutMs}ms`));
        }, bootstrapTimeoutMs);
        const onMessage = (message: unknown) => {
            if (isReadyMessage(message)) {
                if (message.contractHash !== contractHash) {
                    cleanup();
                    reject(
                        new ShirikaEnvironmentError(
                            `Node worker bootstrap failed: RPC contract hash mismatch (expected ${contractHash}, received ${message.contractHash})`,
                        ),
                    );
                    return;
                }
                cleanup();
                resolve();
                return;
            }
            if (isErrorMessage(message)) {
                cleanup();
                reject(new ShirikaEnvironmentError(`Node worker bootstrap failed: ${message.message}`));
            }
        };
        const onError = (error: Error) => {
            cleanup();
            reject(
                createWorkerCrashError(
                    options.workerCrashErrorFactory,
                    {
                        phase: 'bootstrap',
                        kind: 'error',
                        worker,
                        error,
                    },
                    new ShirikaEnvironmentError(`Node worker error during bootstrap: ${error.message}`, { cause: error }),
                ),
            );
        };
        const onExit = (code: number) => {
            cleanup();
            reject(
                createWorkerCrashError(
                    options.workerCrashErrorFactory,
                    {
                        phase: 'bootstrap',
                        kind: 'exit',
                        worker,
                        exitCode: code,
                    },
                    new ShirikaEnvironmentError(`Node worker exited during bootstrap with code ${code}`),
                ),
            );
        };
        function cleanup(): void {
            clearTimeout(timeout);
            worker.off('message', onMessage);
            worker.off('error', onError);
            worker.off('exit', onExit);
        }
        worker.on('message', onMessage);
        worker.once('error', onError);
        worker.once('exit', onExit);
        worker.postMessage(createBootstrapMessage(capacityBytes, contractHash, clientToServerSab, serverToClientSab));
    });
    const endpoint = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(clientToServerSab, capacityBytes), createWaitStrategy(false), 'node main -> worker'),
        inbound: new SharedRingBuffer(createRingLayout(serverToClientSab, capacityBytes), createWaitStrategy(false), 'node worker -> main'),
    });
    const client = createRpcClient(preparedContract, endpoint, options);
    if (options.bindWorkerLifecycle !== false) {
        let runtimeListenersRemoved = false;
        const removeRuntimeListeners = (): void => {
            if (runtimeListenersRemoved) {
                return;
            }
            runtimeListenersRemoved = true;
            worker.off('error', onRuntimeError);
            worker.off('exit', onRuntimeExit);
        };
        const abortWith = (reason: unknown): void => {
            removeRuntimeListeners();
            void client.abort(reason);
        };
        const onRuntimeError = (error: Error) => {
            abortWith(
                createWorkerCrashError(
                    options.workerCrashErrorFactory,
                    {
                        phase: 'runtime',
                        kind: 'error',
                        worker,
                        error,
                    },
                    error,
                ),
            );
        };
        const onRuntimeExit = (code: number) => {
            abortWith(
                createWorkerCrashError(
                    options.workerCrashErrorFactory,
                    {
                        phase: 'runtime',
                        kind: 'exit',
                        worker,
                        exitCode: code,
                    },
                    code !== 0 ? new Error(`Worker exited with code ${code}`) : new Error('Worker exited'),
                ),
            );
        };
        worker.on('error', onRuntimeError);
        worker.on('exit', onRuntimeExit);
        const close = client.close.bind(client);
        const abort = client.abort.bind(client);
        client.close = async () => {
            removeRuntimeListeners();
            return close();
        };
        client.abort = async (reason?: unknown) => {
            removeRuntimeListeners();
            return abort(reason);
        };
    }
    return client;
}
function createWorkerCrashError(factory: NodeWorkerCrashErrorFactory | undefined, context: NodeWorkerCrashContext, fallback: Error): Error {
    if (!factory) {
        return fallback;
    }
    try {
        const error = factory(context);
        return error instanceof Error ? error : fallback;
    } catch (factoryError) {
        console.error('[shirika-rpc] workerCrashErrorFactory failed', {
            phase: context.phase,
            kind: context.kind,
            exitCode: context.exitCode,
            error: factoryError,
        });
        return fallback;
    }
}
