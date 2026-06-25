import { parentPort, threadId } from 'node:worker_threads';
import { runNodeWorkerRpcServer } from '../../../dist/worker-node.js';
import { exampleContract } from '../../../shared/contract.mjs';
import { createExampleHandlers } from '../../../shared/handlers.mjs';

void runNodeWorkerRpcServer({
    contract: exampleContract,
    handlers: createExampleHandlers({ identity: `thread-${threadId}` }),
    parentPortRef: parentPort,
});
