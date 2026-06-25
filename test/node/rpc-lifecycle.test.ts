import { afterEach, describe, expect, test, vi } from 'vitest';
import {
    codecs,
    createRingBufferSab,
    createRingLayout,
    createRpcClient,
    createRpcServer,
    createWaitStrategy,
    DuplexEndpoint,
    defineContract,
    defineHandlers,
    method,
    Opcode,
    type RpcClientControl,
    type RpcFatalErrorEvent,
    type RpcNotifyErrorEvent,
    type RpcServer,
    type RpcTransportOptions,
    type RpcTransportSnapshot,
    SharedRingBuffer,
    ShirikaClosedError,
    ShirikaOversizeError,
    ShirikaTimeoutError,
    voidCodec,
} from '../../dist/index.js';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
function createEndpointPair(capacityBytes: number) {
    const aToB = createRingBufferSab(capacityBytes);
    const bToA = createRingBufferSab(capacityBytes);
    const left = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(aToB, capacityBytes), createWaitStrategy(false), 'left->right'),
        inbound: new SharedRingBuffer(createRingLayout(bToA, capacityBytes), createWaitStrategy(false), 'right->left'),
    });
    const right = new DuplexEndpoint({
        outbound: new SharedRingBuffer(createRingLayout(bToA, capacityBytes), createWaitStrategy(false), 'right->left'),
        inbound: new SharedRingBuffer(createRingLayout(aToB, capacityBytes), createWaitStrategy(false), 'left->right'),
    });
    return { left, right };
}
const lifecycleContract = defineContract({
    ping: method(1, codecs.struct({ text: codecs.string() }), codecs.struct({ text: codecs.string() })),
    failFast: method(2, codecs.struct({ message: codecs.string() }), voidCodec()),
    waitAbortable: method(3, codecs.struct({ ms: codecs.f64() }), codecs.struct({ done: codecs.bool() })),
    waitIgnoreAbort: method(4, codecs.struct({ ms: codecs.f64() }), codecs.struct({ done: codecs.bool() })),
    stats: method(5, voidCodec(), codecs.msgpack()),
    slowNotify: method(6, codecs.struct({ ms: codecs.f64() }), voidCodec()),
    echoBytes: method(7, codecs.bytes(), codecs.bytes()),
});
interface HarnessState {
    aborts: number;
    completions: number;
    notifications: number;
}
interface Harness {
    client: RpcClientControl<typeof lifecycleContract>;
    server: RpcServer<typeof lifecycleContract>;
    state: HarnessState;
}
function createHarness(options: RpcTransportOptions = {}): Harness {
    return createHarnessWithOptions(options, options);
}
function createHarnessWithOptions(clientOptions: RpcTransportOptions = {}, serverOptions: RpcTransportOptions = {}, capacityBytes = 256): Harness {
    const state: HarnessState = {
        aborts: 0,
        completions: 0,
        notifications: 0,
    };
    const { left, right } = createEndpointPair(capacityBytes);
    const client = createRpcClient(lifecycleContract, left, clientOptions);
    const handlers = defineHandlers<typeof lifecycleContract>({
        ping(request) {
            return { text: request.text };
        },
        failFast(request) {
            const error = Object.assign(new Error(request.message), {
                name: 'FailFastError',
                code: 'FAIL_FAST',
            });
            throw error;
        },
        async waitAbortable(request, ctx) {
            await waitWithSignal(request.ms, ctx.signal, () => {
                state.aborts += 1;
            });
            state.completions += 1;
            return { done: true };
        },
        async waitIgnoreAbort(request) {
            await sleep(request.ms);
            state.completions += 1;
            return { done: true };
        },
        stats() {
            return { ...state };
        },
        async slowNotify(request, ctx) {
            state.notifications += 1;
            try {
                await waitWithSignal(request.ms, ctx.signal, () => {
                    state.aborts += 1;
                });
            } catch {
                return;
            }
        },
        echoBytes(request) {
            return new Uint8Array(request);
        },
    });
    const server = createRpcServer(lifecycleContract, handlers, right, serverOptions);
    void server.serve();
    return { client, server, state };
}
function waitWithSignal(ms: number, signal: AbortSignal, onAbort: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            onAbort();
            reject(signal.reason);
            return;
        }
        const timer = setTimeout(() => {
            signal.removeEventListener('abort', handleAbort);
            resolve();
        }, ms);
        const handleAbort = () => {
            clearTimeout(timer);
            onAbort();
            reject(signal.reason);
        };
        signal.addEventListener('abort', handleAbort, { once: true });
    });
}

async function answerNextPing(endpoint: DuplexEndpoint, responseText?: string): Promise<number> {
    const frame = await endpoint.receive();
    expect(frame.header.opcode).toBe(Opcode.REQUEST);
    expect(frame.header.methodId).toBe(lifecycleContract.ping.id);
    const request = frame.readWithCodec(lifecycleContract.ping.request);
    await endpoint.send(Opcode.RESPONSE_OK, frame.header.requestId, frame.header.methodId, lifecycleContract.ping.response, {
        text: responseText ?? request.text,
    });
    return frame.header.requestId;
}

function createRng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 4294967296;
    };
}
function countBucket(snapshot: RpcTransportSnapshot['endpoint']['metrics']['messageSizes']['sent'], label: string): number {
    return snapshot.buckets.find((bucket) => bucket.label === label)?.count ?? 0;
}
describe('rpc lifecycle / cancellation / overload / observability', () => {
    const resources: Harness[] = [];
    afterEach(async () => {
        await Promise.allSettled(resources.splice(0).flatMap((resource) => [resource.client.close(), resource.server.close()]));
    });
    test('success response settles the pending request exactly once', async () => {
        const harness = createHarness();
        resources.push(harness);

        await expect(harness.client.call('ping', { text: 'settle-once' })).resolves.toEqual({ text: 'settle-once' });

        expect(harness.client.snapshot().counters).toMatchObject({
            callsInFlight: 0,
            completed: 1,
            failed: 0,
            timedOut: 0,
            cancelled: 0,
        });
    });
    test('error response settles the pending request exactly once', async () => {
        const harness = createHarness();
        resources.push(harness);

        await expect(harness.client.call('failFast', { message: 'one-error' })).rejects.toMatchObject({
            name: 'ShirikaRemoteError',
            code: 'FAIL_FAST',
        });

        expect(harness.client.snapshot().counters).toMatchObject({
            callsInFlight: 0,
            completed: 0,
            failed: 1,
            timedOut: 0,
            cancelled: 0,
        });
    });
    test('fast remote failure does not surface as unhandledRejection', async () => {
        const harness = createHarness();
        resources.push(harness);
        const unhandled: unknown[] = [];
        const onUnhandled = (reason: unknown) => {
            unhandled.push(reason);
        };
        process.on('unhandledRejection', onUnhandled);
        try {
            await expect(harness.client.call('failFast', { message: 'boom' })).rejects.toMatchObject({
                name: 'ShirikaRemoteError',
                code: 'FAIL_FAST',
                remoteName: 'FailFastError',
            });
            await sleep(25);
            expect(unhandled).toEqual([]);
        } finally {
            process.off('unhandledRejection', onUnhandled);
        }
    });
    test('late response after timeout is dropped and channel remains usable', async () => {
        const harness = createHarness();
        resources.push(harness);
        await expect(harness.client.call('waitIgnoreAbort', { ms: 50 }, { timeoutMs: 10 })).rejects.toBeInstanceOf(ShirikaTimeoutError);
        expect(harness.client.snapshot().counters).toMatchObject({
            callsInFlight: 0,
            completed: 0,
            timedOut: 1,
        });
        await sleep(80);
        expect(harness.client.snapshot().counters).toMatchObject({
            callsInFlight: 0,
            completed: 0,
            timedOut: 1,
        });
        await expect(harness.client.call('ping', { text: 'still-alive' })).resolves.toEqual({ text: 'still-alive' });
        expect(harness.client.snapshot().counters).toMatchObject({
            callsInFlight: 0,
            completed: 1,
            timedOut: 1,
        });
    });
    test('defaultTimeoutMs remains accepted as a deprecated compatibility alias', async () => {
        const harness = createHarness({ defaultTimeoutMs: 15 });
        resources.push(harness);
        await expect(harness.client.call('waitIgnoreAbort', { ms: 40 })).rejects.toBeInstanceOf(ShirikaTimeoutError);
    });
    test('abort signal propagates into server handler context', async () => {
        const harness = createHarness();
        resources.push(harness);
        const controller = new AbortController();
        const pending = harness.client.call('waitAbortable', { ms: 200 }, { signal: controller.signal });
        setTimeout(() => {
            controller.abort(new DOMException('user cancelled', 'AbortError'));
        }, 20);
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
        expect(harness.client.snapshot().counters).toMatchObject({
            callsInFlight: 0,
            cancelled: 1,
        });
        await sleep(20);
        await expect(harness.client.call('stats', undefined)).resolves.toMatchObject({ aborts: 1, completions: 0 });
    });
    test('close settles all pending client requests', async () => {
        const harness = createHarness();
        resources.push(harness);
        const first = harness.client.call('waitIgnoreAbort', { ms: 100 }).catch((error: unknown) => error);
        const second = harness.client.call('waitIgnoreAbort', { ms: 100 }).catch((error: unknown) => error);

        await sleep(5);
        expect(harness.client.snapshot().counters.callsInFlight).toBe(2);
        await harness.client.close();

        await expect(first).resolves.toBeInstanceOf(ShirikaClosedError);
        await expect(second).resolves.toBeInstanceOf(ShirikaClosedError);
        expect(harness.client.snapshot().counters).toMatchObject({
            callsInFlight: 0,
            cancelled: 2,
        });
    });
    test('unknown response remains safe and does not close the client', async () => {
        const fatalEvents: RpcFatalErrorEvent[] = [];
        const { left, right } = createEndpointPair(256);
        const client = createRpcClient(lifecycleContract, left, {
            onFatalError(event) {
                fatalEvents.push(event);
            },
        });
        try {
            await right.send(Opcode.RESPONSE_OK, 123, lifecycleContract.ping.id, lifecycleContract.ping.response, { text: 'unknown' });
            await sleep(20);

            expect(fatalEvents).toEqual([]);
            expect(client.snapshot().counters.callsInFlight).toBe(0);

            const pending = client.call('ping', { text: 'after-unknown' });
            await answerNextPing(right);
            await expect(pending).resolves.toEqual({ text: 'after-unknown' });
        } finally {
            await client.close().catch(() => undefined);
            await right.bestEffortClose().catch(() => undefined);
        }
    });
    test('duplicate response after success remains ignored and channel remains usable', async () => {
        const fatalEvents: RpcFatalErrorEvent[] = [];
        const { left, right } = createEndpointPair(256);
        const client = createRpcClient(lifecycleContract, left, {
            onFatalError(event) {
                fatalEvents.push(event);
            },
        });
        try {
            const first = client.call('ping', { text: 'first' });
            const firstRequestId = await answerNextPing(right);
            await expect(first).resolves.toEqual({ text: 'first' });

            await right.send(Opcode.RESPONSE_OK, firstRequestId, lifecycleContract.ping.id, lifecycleContract.ping.response, { text: 'duplicate' });
            await sleep(20);

            const second = client.call('ping', { text: 'second' });
            await answerNextPing(right);
            await expect(second).resolves.toEqual({ text: 'second' });
            expect(fatalEvents).toEqual([]);
            expect(client.snapshot().counters).toMatchObject({
                callsInFlight: 0,
                completed: 2,
            });
        } finally {
            await client.close().catch(() => undefined);
            await right.bestEffortClose().catch(() => undefined);
        }
    });
    test('send failure cleanup releases the pending witness and keeps the client usable', async () => {
        const harness = createHarnessWithOptions({}, {}, 128);
        resources.push(harness);

        await expect(harness.client.call('echoBytes', new Uint8Array(256))).rejects.toBeInstanceOf(ShirikaOversizeError);
        await sleep(10);
        expect(harness.client.snapshot().counters).toMatchObject({
            callsInFlight: 0,
            failed: 1,
        });
        await expect(harness.client.call('ping', { text: 'after-send-failure' })).resolves.toEqual({ text: 'after-send-failure' });
    });
    test('bounded queue rejects oversubscription with overload error', async () => {
        const harness = createHarness({
            maxInFlight: 1,
            maxQueuedRequests: 1,
            overloadPolicy: 'queue',
        });
        resources.push(harness);
        const first = harness.client.call('waitIgnoreAbort', { ms: 50 });
        const second = harness.client.call('waitIgnoreAbort', { ms: 10 });
        const third = harness.client.call('waitIgnoreAbort', { ms: 10 });
        await expect(third).rejects.toMatchObject({
            name: 'ShirikaRemoteError',
            code: 'SHIRIKA_RPC_OVERLOADED',
            statusCode: 503,
        });
        await expect(first).resolves.toEqual({ done: true });
        await expect(second).resolves.toEqual({ done: true });
    });
    test('snapshot exposes counters, timings, and ring saturation', async () => {
        const harness = createHarness();
        resources.push(harness);
        const pending = harness.client.call('waitIgnoreAbort', { ms: 40 });
        await sleep(10);
        const clientSnapshot: RpcTransportSnapshot = harness.client.snapshot();
        const serverSnapshot: RpcTransportSnapshot = harness.server.snapshot();
        expect(clientSnapshot.role).toBe('client');
        expect(clientSnapshot.counters.callsInFlight).toBe(1);
        expect(clientSnapshot.endpoint.saturation.max).toBeGreaterThanOrEqual(0);
        expect(clientSnapshot.endpoint.saturation.max).toBeLessThanOrEqual(1);
        expect(clientSnapshot.timings.encodeTimeMs.count).toBeGreaterThanOrEqual(1);
        expect(clientSnapshot.timings.queueWaitMs.count).toBeGreaterThanOrEqual(1);
        expect(clientSnapshot.endpoint.metrics.messageSizes.sent.totalCount).toBeGreaterThanOrEqual(1);
        expect(clientSnapshot.endpoint.metrics.messageSizes.received.totalCount).toBeGreaterThanOrEqual(0);
        expect(clientSnapshot.metrics.handlerLatencyByMethod).toEqual({});
        expect(serverSnapshot.role).toBe('server');
        expect(serverSnapshot.counters.callsInFlight).toBe(1);
        expect(serverSnapshot.endpoint.inbound.usedBytes).toBeGreaterThanOrEqual(0);
        expect(serverSnapshot.endpoint.inbound.saturation).toBeGreaterThanOrEqual(0);
        expect(serverSnapshot.endpoint.inbound.saturation).toBeLessThanOrEqual(1);
        expect(serverSnapshot.endpoint.metrics.messageSizes.received.totalCount).toBeGreaterThanOrEqual(1);
        await expect(pending).resolves.toEqual({ done: true });
        const finishedSnapshot = harness.server.snapshot();
        expect(finishedSnapshot.counters.completed).toBe(1);
        expect(finishedSnapshot.timings.handlerTimeMs.count).toBe(1);
        expect(finishedSnapshot.timings.responseSendTimeMs.count).toBe(1);
        expect(finishedSnapshot.metrics.handlerLatencyByMethod.waitIgnoreAbort.stats.count).toBe(1);
        expect(finishedSnapshot.metrics.handlerLatencyByMethod.waitIgnoreAbort.histogram.totalCount).toBe(1);
        expect(finishedSnapshot.metrics.handlerLatencyByMethod.waitIgnoreAbort.invocations.requests).toBe(1);
    });
    test('snapshot metrics expose size buckets, saturation timeline, and per-method latency', async () => {
        const harness = createHarnessWithOptions({}, {}, 4096);
        resources.push(harness);
        await expect(harness.client.call('echoBytes', new Uint8Array(32))).resolves.toEqual(new Uint8Array(32));
        await expect(harness.client.call('echoBytes', new Uint8Array(1024))).resolves.toEqual(new Uint8Array(1024));
        await expect(harness.client.call('echoBytes', new Uint8Array(3900))).resolves.toEqual(new Uint8Array(3900));
        const clientSnapshot = harness.client.snapshot();
        const serverSnapshot = harness.server.snapshot();
        expect(countBucket(clientSnapshot.endpoint.metrics.messageSizes.sent, 'small')).toBeGreaterThanOrEqual(1);
        expect(countBucket(clientSnapshot.endpoint.metrics.messageSizes.sent, 'medium')).toBeGreaterThanOrEqual(1);
        expect(countBucket(clientSnapshot.endpoint.metrics.messageSizes.sent, 'large')).toBeGreaterThanOrEqual(1);
        const outboundThresholds = new Set(clientSnapshot.endpoint.metrics.saturationTimeline.outbound.events.map((event) => event.threshold));
        expect(outboundThresholds.has(0.5)).toBe(true);
        expect(outboundThresholds.has(0.8)).toBe(true);
        expect(outboundThresholds.has(0.95)).toBe(true);
        expect(serverSnapshot.metrics.handlerLatencyByMethod.echoBytes.invocations.requests).toBe(3);
        expect(serverSnapshot.metrics.handlerLatencyByMethod.echoBytes.histogram.totalCount).toBe(3);
    });
    test('notifyErrorPolicy="callback" reports notify failures without closing transport', async () => {
        const notifyEvents: RpcNotifyErrorEvent[] = [];
        const harness = createHarnessWithOptions(
            {},
            {
                notifyErrorPolicy: 'callback',
                onNotifyError(event) {
                    notifyEvents.push(event);
                },
            },
        );
        resources.push(harness);
        await harness.client.notify('failFast', { message: 'notify-callback' });
        await sleep(25);
        expect(notifyEvents).toHaveLength(1);
        expect(notifyEvents[0]).toMatchObject({
            methodName: 'failFast',
            error: expect.objectContaining({ message: 'notify-callback' }),
            snapshot: expect.objectContaining({
                role: 'server',
                counters: expect.objectContaining({ notifyErrors: 1 }),
            }),
        });
        await expect(harness.client.call('ping', { text: 'after-notify-callback' })).resolves.toEqual({
            text: 'after-notify-callback',
        });
    });
    test('notifyErrorPolicy="log" logs notify failures and keeps the transport healthy', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            const harness = createHarnessWithOptions(
                {},
                {
                    notifyErrorPolicy: 'log',
                },
            );
            resources.push(harness);
            await harness.client.notify('failFast', { message: 'notify-log' });
            await sleep(25);
            expect(consoleError).toHaveBeenCalled();
            expect(consoleError.mock.calls[0]?.[0]).toContain('notify handler failed');
            await expect(harness.client.call('ping', { text: 'after-notify-log' })).resolves.toEqual({
                text: 'after-notify-log',
            });
        } finally {
            consoleError.mockRestore();
        }
    });
    test('notifyErrorPolicy="throw" escalates notify failures as fatal transport errors', async () => {
        const fatalEvents: RpcFatalErrorEvent[] = [];
        const harness = createHarnessWithOptions(
            {},
            {
                notifyErrorPolicy: 'throw',
                onFatalError(event) {
                    fatalEvents.push(event);
                },
            },
        );
        resources.push(harness);
        await harness.client.notify('failFast', { message: 'notify-throw' });
        await sleep(25);
        expect(fatalEvents).toHaveLength(1);
        expect(fatalEvents[0]).toMatchObject({
            role: 'server',
            phase: 'handler',
            error: expect.objectContaining({ message: 'notify-throw' }),
        });
        await expect(harness.client.call('ping', { text: 'after-notify-throw' })).rejects.toBeInstanceOf(ShirikaClosedError);
    });
    test('notify flood is bounded and does not wedge subsequent requests', async () => {
        const harness = createHarness({
            maxInFlight: 1,
            maxQueuedRequests: 2,
            overloadPolicy: 'queue',
            defaultCallTimeoutMs: 100,
            defaultResponseTimeoutMs: 100,
        });
        resources.push(harness);
        await Promise.allSettled(Array.from({ length: 24 }, () => harness.client.notify('slowNotify', { ms: 15 })));
        await expect(harness.client.call('ping', { text: 'after-notify-flood' })).resolves.toEqual({
            text: 'after-notify-flood',
        });
    });
    test('randomized mixed workload leaves transport healthy', async () => {
        const harness = createHarness({
            defaultCallTimeoutMs: 30,
            defaultResponseTimeoutMs: 30,
            maxInFlight: 4,
            maxQueuedRequests: 8,
        });
        resources.push(harness);
        const random = createRng(0x51a7c0de);
        const tasks: Promise<unknown>[] = [];
        for (let index = 0; index < 80; index += 1) {
            const choice = Math.floor(random() * 4);
            if (choice === 0) {
                tasks.push(harness.client.call('ping', { text: `ping-${index}` }));
                continue;
            }
            if (choice === 1) {
                const controller = new AbortController();
                const task = harness.client
                    .call('waitAbortable', { ms: 10 + Math.floor(random() * 20) }, { signal: controller.signal })
                    .catch((error: unknown) => error);
                setTimeout(
                    () => {
                        controller.abort(new DOMException('random cancel', 'AbortError'));
                    },
                    Math.floor(random() * 10),
                );
                tasks.push(task);
                continue;
            }
            if (choice === 2) {
                const timeoutMs = random() < 0.5 ? 4 : 25;
                tasks.push(harness.client.call('waitIgnoreAbort', { ms: 6 + Math.floor(random() * 10) }, { timeoutMs }).catch((error: unknown) => error));
                continue;
            }
            tasks.push(harness.client.notify('slowNotify', { ms: Math.floor(random() * 8) }));
        }
        await Promise.allSettled(tasks);
        await expect(harness.client.call('ping', { text: 'after-soak' })).resolves.toEqual({ text: 'after-soak' });
        await expect(harness.client.call('stats', undefined)).resolves.toMatchObject({
            notifications: expect.any(Number),
            aborts: expect.any(Number),
        });
    });
    test('client onFatalError receives receive-loop failures', async () => {
        const fatalEvents: RpcFatalErrorEvent[] = [];
        const { left, right } = createEndpointPair(256);
        const client = createRpcClient(lifecycleContract, left, {
            onFatalError(event) {
                fatalEvents.push(event);
            },
        });
        try {
            await right.send(Opcode.REQUEST, 99, lifecycleContract.ping.id, lifecycleContract.ping.request, { text: 'wrong-direction' });
            await sleep(25);
            expect(fatalEvents).toHaveLength(1);
            expect(fatalEvents[0]).toMatchObject({
                role: 'client',
                phase: 'receive-loop',
            });
            await expect(client.call('ping', { text: 'after-client-fatal' })).rejects.toBeInstanceOf(ShirikaClosedError);
        } finally {
            await client.close().catch(() => undefined);
            await right.bestEffortClose().catch(() => undefined);
        }
    });
});
