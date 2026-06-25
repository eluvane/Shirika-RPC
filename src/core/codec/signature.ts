import type { Codec } from './types.js';

export const CODEC_SIGNATURE = Symbol.for('shirika-rpc.codecSignature');

type CodecWithSignature = Codec<unknown> & {
    readonly [CODEC_SIGNATURE]?: string;
};

export function defineCodecSignature<TCodec extends Codec<unknown>>(codec: TCodec, signature: string): TCodec {
    Object.defineProperty(codec, CODEC_SIGNATURE, {
        value: signature,
        enumerable: false,
        configurable: false,
        writable: false,
    });
    return codec;
}

export function describeCodec(codec: Codec<unknown>): string {
    const signature = (codec as CodecWithSignature)[CODEC_SIGNATURE];
    if (typeof signature === 'string') {
        return signature;
    }
    return codec.kind === 'msgpack' ? 'msgpack' : 'binary';
}
