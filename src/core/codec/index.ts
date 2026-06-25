import { bool, bytes, f64, i32, string, u8, u16, u32, void_ } from './builtins.js';
import { array, optional, struct, tuple } from './combinators.js';
import { msgpack } from './msgpack.js';
export const codecs = {
    void: void_,
    bool,
    u8,
    u16,
    u32,
    i32,
    f64,
    string,
    bytes,
    array,
    optional,
    tuple,
    struct,
    msgpack,
};
export { bool, bytes, f64, i32, string, u8, u16, u32, void_ as voidCodec } from './builtins.js';
export { array, optional, struct, tuple } from './combinators.js';
export { msgpack } from './msgpack.js';
export { CODEC_SIGNATURE, defineCodecSignature, describeCodec } from './signature.js';
export type { BinaryCodec, BinaryReader, BinaryWriter, Codec, CodecValue, MsgpackCodec } from './types.js';
export type { CodecWitness, CodecWitnessComponent, CodecWitnessKind, CodecWitnessValueScope, PreparedBinaryCodec } from './witness.js';
export { isMeasuredWriterValueInScope, isPreparedBinaryCodec, prepareBinaryCodec, readCodecWitness } from './witness.js';
