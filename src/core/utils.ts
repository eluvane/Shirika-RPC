import { ShirikaError } from './errors.js';
export function align8(value: number): number {
    return (value + 7) & ~7;
}
function isPowerOfTwo(value: number): boolean {
    return value > 0 && (value & (value - 1)) === 0;
}
export function assertPowerOfTwo(value: number, label: string): void {
    if (!isPowerOfTwo(value)) {
        throw new ShirikaError(`${label} must be a power of two, received ${value}`);
    }
}
export function deadlineFromTimeout(timeoutMs?: number): number | undefined {
    if (timeoutMs === undefined) {
        return undefined;
    }
    return Date.now() + Math.max(0, timeoutMs);
}
export function remainingTimeout(deadline: number | undefined): number | undefined {
    if (deadline === undefined) {
        return undefined;
    }
    return Math.max(0, deadline - Date.now());
}
export function u32(value: number): number {
    return value >>> 0;
}
export async function yieldToEventLoop(): Promise<void> {
    await new Promise<void>((resolve) => {
        if (typeof setImmediate === 'function') {
            setImmediate(resolve);
        } else {
            setTimeout(resolve, 0);
        }
    });
}
export function describeError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    try {
        return String(error);
    } catch {
        return 'Unknown error';
    }
}
export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}
