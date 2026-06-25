import { Worker } from 'node:worker_threads';
import { afterEach, describe, expect, test } from 'vitest';
import { prepareContract, ShirikaClosedError, type ShirikaRemoteError } from '../../dist/index.js';
import { createNodeWorkerRpcClient } from '../../dist/node.js';
import { exampleContract } from '../shared/contract.js';

function createWorker(): Worker {
    return new Worker(new URL('./fixtures/worker.mjs', import.meta.url));
}
describe('node rpc client', () => {
    const workers: Worker[] = [];
    afterEach(async () => {
        await Promise.allSettled(workers.splice(0).map((worker) => worker.terminate()));
    });
    test('rpc request/response typed path', async () => {
        const worker = createWorker();
        workers.push(worker);
        const client = await createNodeWorkerRpcClient(worker, exampleContract);
        await expect(client.call('ping', { text: 'pong' })).resolves.toEqual({ text: 'pong' });
        await expect(client.call('sum', { a: 20, b: 22 })).resolves.toEqual({ value: 42 });
        await client.close();
    });
    test('node client/server path accepts a prepared contract witness', async () => {
        const worker = createWorker();
        workers.push(worker);
        const preparedContract = prepareContract(exampleContract);
        const client = await createNodeWorkerRpcClient(worker, preparedContract);
        await expect(client.call('sum', { a: 19, b: 23 })).resolves.toEqual({ value: 42 });
        await client.close();
    });
    test('multiple concurrent in-flight requests', async () => {
        const worker = createWorker();
        workers.push(worker);
        const client = await createNodeWorkerRpcClient(worker, exampleContract);
        const responses = await Promise.all(Array.from({ length: 32 }, (_, index) => client.call('sum', { a: index, b: index + 1 })));
        expect(responses[0]).toEqual({ value: 1 });
        expect(responses[31]).toEqual({ value: 63 });
        await client.close();
    });
    test('remote error propagation', async () => {
        const worker = createWorker();
        workers.push(worker);
        const client = await createNodeWorkerRpcClient(worker, exampleContract);
        await expect(client.call('fail', { message: 'boom' })).rejects.toMatchObject({
            name: 'ShirikaRemoteError',
            remoteName: 'ExampleRemoteError',
            code: 'EXAMPLE_FAIL',
            data: {
                identity: expect.any(String),
                message: 'boom',
            },
        } satisfies Partial<ShirikaRemoteError>);
        await client.close();
    });
    test('msgpack dynamic path', async () => {
        const worker = createWorker();
        workers.push(worker);
        const client = await createNodeWorkerRpcClient(worker, exampleContract);
        const payload = { nested: { ok: true }, values: [1, 2, 3] };
        await expect(client.call('dynamic', payload)).resolves.toEqual(payload);
        await client.close();
    });
    test('echoBytes uses binary path', async () => {
        const worker = createWorker();
        workers.push(worker);
        const client = await createNodeWorkerRpcClient(worker, exampleContract);
        const payload = new Uint8Array([1, 2, 3, 4, 5]);
        await expect(client.call('echoBytes', payload)).resolves.toEqual(payload);
        await client.close();
    });
    test('worker crash aborts in-flight request', async () => {
        const worker = createWorker();
        workers.push(worker);
        const client = await createNodeWorkerRpcClient(worker, exampleContract);
        await expect(client.call('dynamic', { kind: 'crash', message: 'boom' })).rejects.toBeInstanceOf(Error);
        await client.close().catch(() => undefined);
    });
    test('close rejects subsequent calls', async () => {
        const worker = createWorker();
        workers.push(worker);
        const client = await createNodeWorkerRpcClient(worker, exampleContract);
        await client.close();
        await expect(client.call('ping', { text: 'after-close' })).rejects.toBeInstanceOf(ShirikaClosedError);
    });
    test('runtime lifecycle listeners are removed on close', async () => {
        const worker = createWorker();
        workers.push(worker);
        const baseErrorListeners = worker.listenerCount('error');
        const baseExitListeners = worker.listenerCount('exit');
        const client = await createNodeWorkerRpcClient(worker, exampleContract);
        expect(worker.listenerCount('error')).toBe(baseErrorListeners + 1);
        expect(worker.listenerCount('exit')).toBe(baseExitListeners + 1);
        await client.close();
        expect(worker.listenerCount('error')).toBe(baseErrorListeners);
        expect(worker.listenerCount('exit')).toBe(baseExitListeners);
    });
    test('bindWorkerLifecycle=false leaves runtime listeners untouched', async () => {
        const worker = createWorker();
        workers.push(worker);
        const baseErrorListeners = worker.listenerCount('error');
        const baseExitListeners = worker.listenerCount('exit');
        const client = await createNodeWorkerRpcClient(worker, exampleContract, { bindWorkerLifecycle: false });
        expect(worker.listenerCount('error')).toBe(baseErrorListeners);
        expect(worker.listenerCount('exit')).toBe(baseExitListeners);
        await client.close();
    });
    test('workerCrashErrorFactory customizes runtime crash errors', async () => {
        const worker = createWorker();
        workers.push(worker);
        const client = await createNodeWorkerRpcClient(worker, exampleContract, {
            workerCrashErrorFactory(context) {
                return new Error(`custom ${context.phase}:${context.kind}`);
            },
        });
        await expect(client.call('dynamic', { kind: 'crash', message: 'boom' })).rejects.toMatchObject({
            message: 'custom runtime:error',
        });
        await client.close().catch(() => undefined);
    });
});
