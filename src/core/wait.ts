import { addAbortListener, normalizeAbortReason, throwIfAborted } from './abort.js';
import { deadlineFromTimeout, remainingTimeout, yieldToEventLoop } from './utils.js';
export type WaitResult = 'ok' | 'not-equal' | 'timed-out';
export interface WaitStrategy {
    readonly canBlock: boolean;
    wait(control: Int32Array, index: number, expected: number, timeoutMs?: number, signal?: AbortSignal): Promise<WaitResult>;
}
interface WaitAsyncResult {
    readonly async: boolean;
    readonly value: WaitResult | PromiseLike<WaitResult>;
}
type AtomicsWithWaitAsync = typeof Atomics & {
    waitAsync?: (control: Int32Array, index: number, expected: number, timeout?: number) => WaitAsyncResult;
};
const atomicsWithWaitAsync = Atomics as AtomicsWithWaitAsync;
class BlockingWaitStrategy implements WaitStrategy {
    readonly canBlock = true;
    async wait(control: Int32Array, index: number, expected: number, timeoutMs?: number, signal?: AbortSignal): Promise<WaitResult> {
        throwIfAborted(signal);
        const result = Atomics.wait(control, index, expected, timeoutMs ?? Number.POSITIVE_INFINITY);
        throwIfAborted(signal);
        return result;
    }
}
class AsyncWaitAsyncStrategy implements WaitStrategy {
    readonly canBlock = false;
    async wait(control: Int32Array, index: number, expected: number, timeoutMs?: number, signal?: AbortSignal): Promise<WaitResult> {
        throwIfAborted(signal);
        const waitAsync = atomicsWithWaitAsync.waitAsync;
        if (!waitAsync) {
            return new AsyncPollingWaitStrategy().wait(control, index, expected, timeoutMs, signal);
        }
        const result = waitAsync(control, index, expected, timeoutMs ?? Number.POSITIVE_INFINITY);
        if (!result.async) {
            throwIfAborted(signal);
            return result.value as WaitResult;
        }
        const waitPromise = Promise.resolve(result.value);
        if (!signal) {
            return waitPromise;
        }
        return raceWaitWithAbort(waitPromise, signal);
    }
}
class AsyncPollingWaitStrategy implements WaitStrategy {
    readonly canBlock = false;
    async wait(control: Int32Array, index: number, expected: number, timeoutMs?: number, signal?: AbortSignal): Promise<WaitResult> {
        throwIfAborted(signal);
        if (Atomics.load(control, index) !== expected) {
            return 'not-equal';
        }
        const deadline = deadlineFromTimeout(timeoutMs);
        while (Atomics.load(control, index) === expected) {
            throwIfAborted(signal);
            const remaining = remainingTimeout(deadline);
            if (remaining !== undefined && remaining <= 0) {
                return 'timed-out';
            }
            await yieldToEventLoop();
        }
        throwIfAborted(signal);
        return 'ok';
    }
}
const blockingWaitStrategy = new BlockingWaitStrategy();
const asyncWaitAsyncStrategy = new AsyncWaitAsyncStrategy();
const asyncPollingWaitStrategy = new AsyncPollingWaitStrategy();
export function createWaitStrategy(canBlock: boolean): WaitStrategy {
    if (canBlock) {
        return blockingWaitStrategy;
    }
    return typeof atomicsWithWaitAsync.waitAsync === 'function' ? asyncWaitAsyncStrategy : asyncPollingWaitStrategy;
}
function raceWaitWithAbort(waitPromise: PromiseLike<WaitResult>, signal: AbortSignal): Promise<WaitResult> {
    if (signal.aborted) {
        return Promise.reject(normalizeAbortReason(signal.reason));
    }
    return new Promise<WaitResult>((resolve, reject) => {
        let settled = false;
        const cleanup = addAbortListener(signal, () => {
            if (settled) {
                return;
            }
            settled = true;
            reject(normalizeAbortReason(signal.reason));
        });
        Promise.resolve(waitPromise).then(
            (result) => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                resolve(result);
            },
            (error: unknown) => {
                if (settled) {
                    return;
                }
                settled = true;
                cleanup();
                reject(error);
            },
        );
    });
}
