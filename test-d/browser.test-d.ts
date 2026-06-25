import type { RpcClientControl } from 'shirika-rpc';
import { createBrowserWorkerRpcClient } from 'shirika-rpc/browser';
import { expectType } from 'tsd';
import { exampleContract } from '../shared/contract.mjs';

declare const worker: Worker;
expectType<Promise<RpcClientControl<typeof exampleContract>>>(createBrowserWorkerRpcClient(worker, exampleContract));
