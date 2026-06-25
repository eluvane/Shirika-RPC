import { parentPort } from 'node:worker_threads';
import type { NodeWorkerRpcServerOptions } from './adapters/node-worker.js';
import { runNodeWorkerRpcServer as runNodeWorkerRpcServerImpl } from './adapters/node-worker.js';
import type { ContractShape } from './core/rpc/contract.js';

export type { NodeWorkerRpcServerOptions } from './adapters/node-worker.js';
export function runNodeWorkerRpcServer<C extends ContractShape>(options: NodeWorkerRpcServerOptions<C>) {
    return runNodeWorkerRpcServerImpl({
        ...options,
        parentPortRef: options.parentPortRef ?? parentPort,
    });
}
