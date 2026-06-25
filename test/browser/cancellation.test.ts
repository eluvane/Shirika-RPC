import { afterEach, describe, expect, test } from 'vitest';
import { createBrowserWorkerRpcClient } from '../../dist/browser.js';
import { cancelContract } from './fixtures/cancel-contract';

function createCancelWorker(): Worker {
    return new Worker(new URL('./fixtures/cancel-worker.ts', import.meta.url), { type: 'module' });
}
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
async function expectStatsEventually(readStats: () => Promise<unknown>, expected: Record<string, number>): Promise<void> {
    let last: unknown;
    for (let attempt = 0; attempt < 50; attempt += 1) {
        last = await readStats();
        if (matchesStats(last, expected)) {
            expect(last).toMatchObject(expected);
            return;
        }
        await sleep(20);
    }
    expect(last).toMatchObject(expected);
}
function matchesStats(value: unknown, expected: Record<string, number>): boolean {
    if (!value || typeof value !== 'object') {
        return false;
    }
    const stats = value as Record<string, unknown>;
    return Object.entries(expected).every(([key, expectedValue]) => stats[key] === expectedValue);
}
describe('browser rpc cancellation', () => {
    const workers: Worker[] = [];
    afterEach(async () => {
        await Promise.all(
            workers.splice(0).map(async (worker) => {
                worker.terminate();
            }),
        );
    });
    test('AbortSignal propagates into browser worker handler', async () => {
        const worker = createCancelWorker();
        workers.push(worker);
        const client = await createBrowserWorkerRpcClient(worker, cancelContract);
        const controller = new AbortController();
        const pending = client.call('run', { ms: 1000 }, { signal: controller.signal });
        await expectStatsEventually(() => client.call('stats', undefined), { started: 1 });
        controller.abort(new DOMException('browser cancel', 'AbortError'));
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        await expectStatsEventually(() => client.call('stats', undefined), { aborted: 1 });
        await client.close();
    });
});
