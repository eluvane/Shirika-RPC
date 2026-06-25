import type { Worker } from 'node:worker_threads';
import type { RpcClientControl } from 'shirika-rpc';
import {
    createNodeWorkerPool,
    createNodeWorkerRpcClient,
    type NodeWorkerCrashContext,
    type NodeWorkerPool,
    type NodeWorkerRespawnPolicy,
    ShirikaWorkerCrashedError,
} from 'shirika-rpc/node';
import { expectType } from 'tsd';
import { exampleContract } from '../shared/contract.mjs';

declare const worker: Worker;
declare const crashContext: NodeWorkerCrashContext;
declare const respawnPolicy: NodeWorkerRespawnPolicy;
expectType<Promise<RpcClientControl<typeof exampleContract>>>(createNodeWorkerRpcClient(worker, exampleContract));
expectType<Promise<NodeWorkerPool<typeof exampleContract>>>(createNodeWorkerPool(() => worker, exampleContract, { size: 2 }));
expectType<'bootstrap' | 'runtime'>(crashContext.phase);
expectType<boolean>(respawnPolicy.enabled ?? true);
expectType<typeof ShirikaWorkerCrashedError>(ShirikaWorkerCrashedError);
expectType<Promise<NodeWorkerPool<typeof exampleContract>>>(
    createNodeWorkerPool(() => worker, exampleContract, {
        size: 2,
        respawnPolicy: { enabled: true, delayMs: 10 },
        onWorkerCrash(workerId, error) {
            expectType<number>(workerId);
            expectType<ShirikaWorkerCrashedError>(error);
        },
        onWorkerRespawn(workerId) {
            expectType<number>(workerId);
        },
    }),
);
