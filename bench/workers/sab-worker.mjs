import { parentPort, threadId } from 'node:worker_threads';
import { runNodeWorkerRpcServer } from '../../dist/worker-node.js';
import { exampleContract } from '../../shared/contract.mjs';
import { createExampleHandlers } from '../../shared/handlers.mjs';

await runNodeWorkerRpcServer({
    contract: exampleContract,
    handlers: createExampleHandlers({ identity: `bench-thread-${threadId}` }),
    parentPortRef: parentPort,
});
