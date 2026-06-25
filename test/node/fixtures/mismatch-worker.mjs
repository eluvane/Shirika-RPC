import { parentPort, threadId } from 'node:worker_threads';
import { codecs, defineContract, method } from '../../../dist/index.js';
import { runNodeWorkerRpcServer } from '../../../dist/worker-node.js';
import { createExampleHandlers } from '../../../shared/handlers.mjs';

const mismatchedContract = defineContract({
    ping: method(1, codecs.struct({ text: codecs.string() }), codecs.struct({ text: codecs.string() })),
    sum: method(99, codecs.struct({ a: codecs.f64(), b: codecs.f64() }), codecs.struct({ value: codecs.f64() })),
    echoBytes: method(3, codecs.bytes(), codecs.bytes()),
    dynamic: method(4, codecs.msgpack(), codecs.msgpack()),
    fail: method(5, codecs.struct({ message: codecs.string() }), codecs.void()),
});
await runNodeWorkerRpcServer({
    contract: mismatchedContract,
    handlers: createExampleHandlers({ identity: `mismatch-${threadId}` }),
    parentPortRef: parentPort,
}).catch(() => undefined);
