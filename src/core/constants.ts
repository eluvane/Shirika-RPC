export const CONTROL_I32_COUNT = 8;
export const DEFAULT_CAPACITY_BYTES = 1 << 20;
export const HEADER_SIZE = 32;
export const MIN_CAPACITY_BYTES = HEADER_SIZE;
export const MAX_CAPACITY_BYTES = 1 << 30;
export const FRAME_MAGIC = 0x53545031;
export const FRAME_VERSION = 1;
export const NORMALIZE_THRESHOLD = 1 << 30;
export const UINT32_MAX = 0xffffffff;
export const MAX_METHOD_ID = UINT32_MAX;
export enum ControlIndex {
    READ_SEQ = 0,
    WRITE_SEQ = 1,
    DATA_SEQ = 2,
    SPACE_SEQ = 3,
    STATE = 4,
    LAST_ERROR = 5,
    RESERVED_0 = 6,
    RESERVED_1 = 7,
}
export enum TransportState {
    OPEN = 0,
    CLOSING = 1,
    CLOSED = 2,
    ERRORED = 3,
}
export enum Opcode {
    REQUEST = 1,
    RESPONSE_OK = 2,
    RESPONSE_ERR = 3,
    NOTIFY = 4,
    CLOSE = 5,
    CANCEL = 6,
}
export enum FrameFlag {
    NONE = 0,
    HAS_DEADLINE = 1,
}
export enum CancelCode {
    CLIENT_ABORT = 1,
    TIMEOUT = 2,
    CLIENT_CLOSE = 3,
}
export enum TransportErrorHint {
    NONE = 0,
    CLOSED = 1,
    PROTOCOL = 2,
    OVERSIZE = 3,
    TIMEOUT = 4,
    INTERNAL = 5,
}
