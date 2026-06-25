import { parentPort } from 'node:worker_threads';

parentPort.on('message', (message) => {
    if (message?.type === 'echo') {
        parentPort.postMessage({
            id: message.id,
            payload: message.payload,
        });
        return;
    }
    if (message?.type === 'echo-transfer') {
        const transferList = message.payload?.buffer instanceof ArrayBuffer ? [message.payload.buffer] : [];
        parentPort.postMessage(
            {
                id: message.id,
                payload: message.payload,
            },
            transferList,
        );
    }
});
