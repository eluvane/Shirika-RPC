import type { MethodDef } from '../dist/index.js';
export declare const exampleMethodIds: {
    readonly ping: 1;
    readonly sum: 2;
    readonly echoBytes: 3;
    readonly dynamic: 4;
    readonly fail: 5;
};
export declare const exampleContract: {
    readonly ping: MethodDef<
        {
            text: string;
        },
        {
            text: string;
        }
    >;
    readonly sum: MethodDef<
        {
            a: number;
            b: number;
        },
        {
            value: number;
        }
    >;
    readonly echoBytes: MethodDef<Uint8Array, Uint8Array>;
    readonly dynamic: MethodDef<unknown, unknown>;
    readonly fail: MethodDef<
        {
            message: string;
        },
        void
    >;
};
