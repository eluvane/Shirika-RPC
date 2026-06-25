import { codecs, defineContract, method } from '../dist/index.js';
export const exampleMethodIds = Object.freeze({
    ping: 1,
    sum: 2,
    echoBytes: 3,
    dynamic: 4,
    fail: 5,
});
export const exampleContract = defineContract({
    ping: method(exampleMethodIds.ping, codecs.struct({ text: codecs.string() }), codecs.struct({ text: codecs.string() })),
    sum: method(exampleMethodIds.sum, codecs.struct({ a: codecs.f64(), b: codecs.f64() }), codecs.struct({ value: codecs.f64() })),
    echoBytes: method(exampleMethodIds.echoBytes, codecs.bytes(), codecs.bytes()),
    dynamic: method(exampleMethodIds.dynamic, codecs.msgpack(), codecs.msgpack()),
    fail: method(exampleMethodIds.fail, codecs.struct({ message: codecs.string() }), codecs.void()),
});
