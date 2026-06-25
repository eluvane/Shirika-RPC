const encoder = new TextEncoder();
const decoder = new TextDecoder();
export function utf8ByteLength(value: string): number {
    return encoder.encode(value).byteLength;
}
export function encodeUtf8(value: string): Uint8Array {
    return encoder.encode(value);
}
export function encodeUtf8Into(value: string, target: Uint8Array): TextEncoderEncodeIntoResult {
    if (typeof SharedArrayBuffer === 'function' && target.buffer instanceof SharedArrayBuffer) {
        const bytes = encoder.encode(value);
        target.set(bytes);
        return { read: value.length, written: bytes.byteLength };
    }
    return encoder.encodeInto(value, target);
}
export function decodeUtf8(value: Uint8Array): string {
    const bytes = typeof SharedArrayBuffer === 'function' && value.buffer instanceof SharedArrayBuffer ? new Uint8Array(value) : value;
    return decoder.decode(bytes);
}
