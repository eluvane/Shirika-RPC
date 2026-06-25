import { CONTROL_I32_COUNT, MAX_CAPACITY_BYTES, MIN_CAPACITY_BYTES } from '../constants.js';
import { ShirikaError } from '../errors.js';
import { assertPowerOfTwo } from '../utils.js';
export interface RingLayout {
    readonly sab: SharedArrayBuffer;
    readonly control: Int32Array;
    readonly data: Uint8Array;
    readonly capacityBytes: number;
    readonly controlByteLength: number;
    readonly totalByteLength: number;
}
export function getControlByteLength(): number {
    return CONTROL_I32_COUNT * Int32Array.BYTES_PER_ELEMENT;
}
function assertCapacityBytes(capacityBytes: number): void {
    if (!Number.isInteger(capacityBytes)) {
        throw new ShirikaError(`capacityBytes must be an integer, received ${capacityBytes}`);
    }
    if (capacityBytes < MIN_CAPACITY_BYTES) {
        throw new ShirikaError(`capacityBytes must be at least ${MIN_CAPACITY_BYTES} bytes, received ${capacityBytes}`);
    }
    if (capacityBytes > MAX_CAPACITY_BYTES) {
        throw new ShirikaError(`capacityBytes must be at most ${MAX_CAPACITY_BYTES} bytes, received ${capacityBytes}`);
    }
    assertPowerOfTwo(capacityBytes, 'capacityBytes');
}
export function createRingBufferSab(capacityBytes: number): SharedArrayBuffer {
    assertCapacityBytes(capacityBytes);
    return new SharedArrayBuffer(getControlByteLength() + capacityBytes);
}
export function createRingLayout(sab: SharedArrayBuffer, capacityBytes: number): RingLayout {
    assertCapacityBytes(capacityBytes);
    const controlByteLength = getControlByteLength();
    const expectedByteLength = controlByteLength + capacityBytes;
    if (sab.byteLength !== expectedByteLength) {
        throw new ShirikaError(`SharedArrayBuffer byteLength ${sab.byteLength} does not match expected ring layout size ${expectedByteLength}`);
    }
    return {
        sab,
        control: new Int32Array(sab, 0, CONTROL_I32_COUNT),
        data: new Uint8Array(sab, controlByteLength, capacityBytes),
        capacityBytes,
        controlByteLength,
        totalByteLength: expectedByteLength,
    };
}
