export function createAbortError(message = 'The operation was aborted'): Error {
    if (typeof DOMException === 'function') {
        return new DOMException(message, 'AbortError');
    }
    const error = new Error(message);
    error.name = 'AbortError';
    return error;
}
export function normalizeAbortReason(reason: unknown, fallbackMessage = 'The operation was aborted'): unknown {
    return reason === undefined ? createAbortError(fallbackMessage) : reason;
}
export function throwIfAborted(signal: AbortSignal | undefined, fallbackMessage?: string): void {
    if (!signal?.aborted) {
        return;
    }
    throw normalizeAbortReason(signal.reason, fallbackMessage);
}
export function addAbortListener(signal: AbortSignal | undefined, listener: () => void): () => void {
    if (!signal) {
        return () => undefined;
    }
    if (signal.aborted) {
        listener();
        return () => undefined;
    }
    const onAbort = () => {
        listener();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    return () => {
        signal.removeEventListener('abort', onAbort);
    };
}
