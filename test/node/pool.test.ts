import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, test } from 'vitest';
import { createNodeWorkerPool, ShirikaClosedError, ShirikaWorkerCrashedError } from '../../dist/node.js';
import { exampleContract } from '../shared/contract.js';

function createWorker(): Worker {
    return new Worker(new URL('./fixtures/worker.mjs', import.meta.url));
}
function createMismatchWorker(): Worker {
    return new Worker(new URL('./fixtures/mismatch-worker.mjs', import.meta.url));
}
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
async function waitForValue<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    const startedAt = Date.now();
    let lastError: unknown;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            await sleep(25);
        }
    }
    throw lastError instanceof Error ? lastError : new Error('Timed out waiting for worker pool recovery');
}
describe('node worker pool', () => {
    const pools: Array<{
        close(): Promise<void>;
    }> = [];
    const workers: Worker[] = [];
    afterEach(async () => {
        await Promise.allSettled(pools.splice(0).map((pool) => pool.close()));
        await Promise.allSettled(workers.splice(0).map((worker) => worker.terminate()));
    });
    test('least-busy scheduling avoids sending new work to a busy worker', async () => {
        const pool = await createNodeWorkerPool(createWorker, exampleContract, { size: 2 });
        pools.push(pool);
        const slowTask = pool.call('dynamic', { kind: 'sleepIdentity', ms: 120 }) as Promise<{
            identity: string;
        }>;
        await sleep(20);
        const quickIdentities: string[] = [];
        for (let index = 0; index < 3; index += 1) {
            const result = (await pool.call('dynamic', { kind: 'identity' })) as {
                identity: string;
            };
            quickIdentities.push(result.identity);
        }
        const slowResult = await slowTask;
        expect(new Set(quickIdentities).size).toBe(1);
        expect(quickIdentities[0]).not.toBe(slowResult.identity);
    });
    test('crashed worker is evicted and respawned', async () => {
        const crashes: ShirikaWorkerCrashedError[] = [];
        const respawns: number[] = [];
        const pool = await createNodeWorkerPool(createWorker, exampleContract, {
            size: 1,
            bootstrapTimeoutMs: 1000,
            onWorkerCrash(_workerId, error) {
                crashes.push(error);
            },
            onWorkerRespawn(workerId) {
                respawns.push(workerId);
            },
        });
        pools.push(pool);
        await expect(pool.call('dynamic', { kind: 'crash', message: 'pool-crash' })).rejects.toBeInstanceOf(ShirikaWorkerCrashedError);
        const recovered = await waitForValue(
            () =>
                pool.call('dynamic', { kind: 'identity' }) as Promise<{
                    identity: string;
                }>,
            2000,
        );
        expect(recovered.identity).toEqual(expect.any(String));
        expect(crashes).toHaveLength(1);
        expect(crashes[0]).toMatchObject({ workerId: 0, phase: 'runtime', kind: 'error' });
        expect(respawns).toEqual([0]);
    });
    test('respawn policy can leave a crashed slot dead', async () => {
        const pool = await createNodeWorkerPool(createWorker, exampleContract, {
            size: 1,
            bootstrapTimeoutMs: 1000,
            respawnPolicy: { enabled: false },
        });
        pools.push(pool);
        await expect(pool.call('dynamic', { kind: 'crash', message: 'no-respawn' })).rejects.toBeInstanceOf(ShirikaWorkerCrashedError);
        await expect(pool.call('dynamic', { kind: 'identity' })).rejects.toBeInstanceOf(ShirikaClosedError);
    });
    test('partial bootstrap failure cleans up already-started workers', async () => {
        let created = 0;
        const exits: Promise<void>[] = [];
        const factory = () => {
            const worker = created === 0 ? createWorker() : createMismatchWorker();
            created += 1;
            workers.push(worker);
            exits.push(
                new Promise((resolve) => {
                    worker.once('exit', () => {
                        resolve();
                    });
                }),
            );
            return worker;
        };
        await expect(createNodeWorkerPool(factory, exampleContract, { size: 2, bootstrapTimeoutMs: 1000 })).rejects.toBeInstanceOf(Error);
        await Promise.allSettled(exits);
        expect(created).toBe(2);
    });
});
