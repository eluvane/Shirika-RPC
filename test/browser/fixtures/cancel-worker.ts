import { defineHandlers } from '../../../dist/index.js';
import { runBrowserWorkerRpcServer } from '../../../dist/worker-browser.js';
import { cancelContract } from './cancel-contract';

let started = 0;
let aborted = 0;
const handlers = defineHandlers<typeof cancelContract>({
    async run(request, ctx) {
        started += 1;
        await new Promise<void>((resolve, reject) => {
            if (ctx.signal.aborted) {
                aborted += 1;
                reject(ctx.signal.reason);
                return;
            }
            const timer = setTimeout(() => {
                ctx.signal.removeEventListener('abort', handleAbort);
                resolve();
            }, request.ms);
            const handleAbort = () => {
                clearTimeout(timer);
                aborted += 1;
                reject(ctx.signal.reason);
            };
            ctx.signal.addEventListener('abort', handleAbort, { once: true });
        });
    },
    stats() {
        return { started, aborted };
    },
});
void runBrowserWorkerRpcServer({
    contract: cancelContract,
    handlers,
});
