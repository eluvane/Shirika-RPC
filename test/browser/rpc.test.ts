import { afterEach, describe, expect, test } from 'vitest';
import { createBrowserWorkerRpcClient } from '../../dist/browser.js';
import { exampleContract } from '../shared/contract.js';

function createWorker(): Worker {
    return new Worker(new URL('./fixtures/worker.ts', import.meta.url), { type: 'module' });
}
describe('browser rpc client', () => {
    const workers: Worker[] = [];
    afterEach(async () => {
        await Promise.all(
            workers.splice(0).map(async (worker) => {
                worker.terminate();
            }),
        );
    });
    test('browser worker bootstrap/ready + ping', async () => {
        const worker = createWorker();
        workers.push(worker);
        const client = await createBrowserWorkerRpcClient(worker, exampleContract);
        await expect(client.call('ping', { text: 'hello' })).resolves.toEqual({ text: 'hello' });
        await client.close();
    });
    test('sum', async () => {
        const worker = createWorker();
        workers.push(worker);
        const client = await createBrowserWorkerRpcClient(worker, exampleContract);
        await expect(client.call('sum', { a: 10, b: 32 })).resolves.toEqual({ value: 42 });
        await client.close();
    });
    test('echoBytes', async () => {
        const worker = createWorker();
        workers.push(worker);
        const client = await createBrowserWorkerRpcClient(worker, exampleContract);
        const payload = new Uint8Array([1, 2, 3, 4]);
        await expect(client.call('echoBytes', payload)).resolves.toEqual(payload);
        await client.close();
    });
    test('dynamic', async () => {
        const worker = createWorker();
        workers.push(worker);
        const client = await createBrowserWorkerRpcClient(worker, exampleContract);
        const payload = { browser: true, nested: ['a', 'b'] };
        await expect(client.call('dynamic', payload)).resolves.toEqual(payload);
        await client.close();
    });
    test('fail', async () => {
        const worker = createWorker();
        workers.push(worker);
        const client = await createBrowserWorkerRpcClient(worker, exampleContract);
        await expect(client.call('fail', { message: 'browser-boom' })).rejects.toMatchObject({
            name: 'ShirikaRemoteError',
            remoteName: 'ExampleRemoteError',
            code: 'EXAMPLE_FAIL',
        });
        await client.close();
    });
    test('concurrent requests', async () => {
        const worker = createWorker();
        workers.push(worker);
        const client = await createBrowserWorkerRpcClient(worker, exampleContract);
        const results = await Promise.all(Array.from({ length: 20 }, (_, index) => client.call('sum', { a: index, b: 2 * index })));
        expect(results[0]).toEqual({ value: 0 });
        expect(results[19]).toEqual({ value: 57 });
        await client.close();
    });
    test('browser main thread API remains async and non-blocking', async () => {
        const worker = createWorker();
        workers.push(worker);
        const client = await createBrowserWorkerRpcClient(worker, exampleContract);
        const promise = client.call('sum', { a: 1, b: 2 });
        let microtaskRan = false;
        queueMicrotask(() => {
            microtaskRan = true;
        });
        await Promise.resolve();
        expect(microtaskRan).toBe(true);
        await expect(promise).resolves.toEqual({ value: 3 });
        await client.close();
    });
});
