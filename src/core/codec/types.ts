export interface BinaryWriter {
    readonly remainingBytes: number;
    writeU8(value: number): void;
    writeU16(value: number): void;
    writeU32(value: number): void;
    writeI32(value: number): void;
    writeF64(value: number): void;
    writeBool(value: boolean): void;
    writeBytes(value: Uint8Array): void;
    writeStringUtf8(value: string): void;
    writeVarBytes(value: Uint8Array): void;
    writeArrayHeader(length: number): void;
}
export interface BinaryReader {
    readonly remainingBytes: number;
    readU8(): number;
    readU16(): number;
    readU32(): number;
    readI32(): number;
    readF64(): number;
    readBool(): boolean;
    readBytes(length: number): Uint8Array;
    readStringUtf8(): string;
    readVarBytes(): Uint8Array;
    readArrayHeader(): number;
}
export interface BinaryCodec<T> {
    readonly kind: 'binary';
    measure(value: T): number;
    write(writer: BinaryWriter, value: T): void;
    read(reader: BinaryReader): T;
}
export interface MsgpackCodec<T> {
    readonly kind: 'msgpack';
    encode(value: T): Uint8Array;
    decode(bytes: Uint8Array): T;
    measure?(value: T): number;
    write?(writer: BinaryWriter, value: T): void;
    read?(reader: BinaryReader, payloadLength: number): T;
}
export type Codec<T> = BinaryCodec<T> | MsgpackCodec<T>;
export type CodecValue<TCodec extends Codec<unknown>> = TCodec extends Codec<infer TValue> ? TValue : never;
