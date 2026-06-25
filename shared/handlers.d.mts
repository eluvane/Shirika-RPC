import type { RpcHandlers } from '../dist/index.js';
import type { exampleContract } from './contract.mjs';
export interface ExampleHandlerOptions {
    identity?: string;
}
export declare function createExampleHandlers(options?: ExampleHandlerOptions): RpcHandlers<typeof exampleContract>;
export { exampleContract };
