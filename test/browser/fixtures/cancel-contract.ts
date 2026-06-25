import { codecs, defineContract, method } from '../../../dist/index.js';
export const cancelContract = defineContract({
    run: method(1, codecs.struct({ ms: codecs.f64() }), codecs.void()),
    stats: method(2, codecs.void(), codecs.msgpack()),
});
