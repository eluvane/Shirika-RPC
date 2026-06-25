import type { ContractShape } from './contract.js';
import type { RpcHandlers } from './types.js';

export function defineHandlers<C extends ContractShape>(handlers: RpcHandlers<C>): RpcHandlers<C> {
    return handlers;
}
