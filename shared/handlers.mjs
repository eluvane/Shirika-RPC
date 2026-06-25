import { defineHandlers } from '../dist/index.js';
import { exampleContract } from './contract.mjs';

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
export function createExampleHandlers(options = {}) {
    const identity = options.identity ?? 'worker';
    return defineHandlers({
        ping(request) {
            return { text: request.text };
        },
        sum(request) {
            return { value: request.a + request.b };
        },
        echoBytes(request) {
            return request;
        },
        async dynamic(request) {
            if (request && typeof request === 'object' && !Array.isArray(request) && request.kind === 'identity') {
                return {
                    identity,
                };
            }
            if (request && typeof request === 'object' && !Array.isArray(request) && request.kind === 'sleepIdentity') {
                await sleep(typeof request.ms === 'number' ? request.ms : 0);
                return {
                    identity,
                };
            }
            if (request && typeof request === 'object' && !Array.isArray(request) && request.kind === 'crash') {
                queueMicrotask(() => {
                    throw new Error(request.message ?? 'intentional worker crash');
                });
                return new Promise(() => {
                    return;
                });
            }
            return request;
        },
        fail(request) {
            const error = Object.assign(new Error(request.message), {
                name: 'ExampleRemoteError',
                code: 'EXAMPLE_FAIL',
                data: {
                    identity,
                    message: request.message,
                },
            });
            throw error;
        },
    });
}
export { exampleContract };
