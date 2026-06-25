import type { ContractShape, MethodNames, RequestOf, ResponseOf } from './contract.js';
import type { RpcFatalErrorEvent, RpcNotifyErrorEvent, RpcNotifyErrorPolicy, RpcTransportObserver, RpcTransportSnapshot } from './observability.js';
export interface RpcCallOptions {
    readonly timeoutMs?: number;
    readonly signal?: AbortSignal;
}
export type RpcOverloadPolicy = 'queue' | 'reject';
export interface RpcTransportOptions extends RpcTransportObserver {
    readonly defaultTimeoutMs?: number;
    readonly defaultCallTimeoutMs?: number;
    readonly defaultResponseTimeoutMs?: number;
    readonly closeTimeoutMs?: number;
    readonly maxInFlight?: number;
    readonly maxQueuedRequests?: number;
    readonly overloadPolicy?: RpcOverloadPolicy;
    readonly notifyErrorPolicy?: RpcNotifyErrorPolicy;
    readonly onFatalError?: (event: RpcFatalErrorEvent) => void;
    readonly onNotifyError?: (event: RpcNotifyErrorEvent) => void;
}
export interface RpcClient<C extends ContractShape> {
    call<K extends MethodNames<C>>(method: K, request: RequestOf<C, K>, options?: RpcCallOptions): Promise<ResponseOf<C, K>>;
    notify<K extends MethodNames<C>>(method: K, request: RequestOf<C, K>, options?: RpcCallOptions): Promise<void>;
    close(): Promise<void>;
}
export interface RpcClientControl<C extends ContractShape> extends RpcClient<C> {
    abort(reason?: unknown): Promise<void>;
    readonly closed: boolean;
    snapshot(): RpcTransportSnapshot;
}
export interface RpcHandlerContext<C extends ContractShape, K extends MethodNames<C>> {
    readonly requestId: number;
    readonly method: K;
    readonly kind: 'request' | 'notify';
    readonly signal: AbortSignal;
    readonly deadline: number | undefined;
}
export type RpcHandlers<C extends ContractShape> = {
    [K in MethodNames<C>]: (request: RequestOf<C, K>, ctx: RpcHandlerContext<C, K>) => ResponseOf<C, K> | Promise<ResponseOf<C, K>>;
};
export interface RpcServer<_C extends ContractShape> {
    serve(): Promise<void>;
    close(reason?: unknown): Promise<void>;
    snapshot(): RpcTransportSnapshot;
}
