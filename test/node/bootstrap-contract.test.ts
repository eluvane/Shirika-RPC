import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, test } from 'vitest';
import { createNodeWorkerRpcClient } from '../../dist/node.js';
import { exampleContract } from '../shared/contract.js';

function createMismatchWorker(): Worker {
    return new Worker(new URL('./fixtures/mismatch-worker.mjs', import.meta.url));
}
describe('bootstrap contract compatibility', () => {
    const workers: Worker[] = [];
    afterEach(async () => {
        await Promise.allSettled(workers.splice(0).map((worker) => worker.terminate()));
    });
    test('rejects mismatched RPC contract during bootstrap', async () => {
        const worker = createMismatchWorker();
        workers.push(worker);
        await expect(createNodeWorkerRpcClient(worker, exampleContract, { bootstrapTimeoutMs: 1000 })).rejects.toMatchObject({
            name: 'ShirikaEnvironmentError',
            message: expect.stringContaining('contract hash mismatch'),
        });
    });
});
