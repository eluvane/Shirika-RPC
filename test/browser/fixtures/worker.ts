import { runBrowserWorkerRpcServer } from '../../../dist/worker-browser.js';
import { exampleContract } from '../../../shared/contract.mjs';
import { createExampleHandlers } from '../../../shared/handlers.mjs';

void runBrowserWorkerRpcServer({
    contract: exampleContract,
    handlers: createExampleHandlers({ identity: 'browser-worker' }),
});
