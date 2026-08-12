export class ShirikaError extends Error {
    readonly code: string | number = 'SHIRIKA_ERROR';

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ShirikaError';
    }
}

export class ShirikaTimeoutError extends ShirikaError {
    override readonly code = 'SHIRIKA_TIMEOUT';

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ShirikaTimeoutError';
    }
}

export class ShirikaClosedError extends ShirikaError {
    override readonly code = 'SHIRIKA_CLOSED';

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ShirikaClosedError';
    }
}

export class ShirikaOversizeError extends ShirikaError {
    override readonly code = 'SHIRIKA_OVERSIZE';

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ShirikaOversizeError';
    }
}

export class ShirikaProtocolError extends ShirikaError {
    override readonly code = 'SHIRIKA_PROTOCOL';

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ShirikaProtocolError';
    }
}

export class ShirikaEnvironmentError extends ShirikaError {
    override readonly code = 'SHIRIKA_ENVIRONMENT';

    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ShirikaEnvironmentError';
    }
}

export interface ShirikaWorkerCrashedErrorInit {
    readonly workerId: number;
    readonly threadId?: number | undefined;
    readonly phase: 'bootstrap' | 'runtime';
    readonly kind: 'error' | 'exit';
    readonly exitCode?: number | undefined;
}

export class ShirikaWorkerCrashedError extends ShirikaError {
    override readonly code = 'SHIRIKA_WORKER_CRASHED';
    readonly workerId: number;
    readonly threadId: number | undefined;
    readonly phase: ShirikaWorkerCrashedErrorInit['phase'];
    readonly kind: ShirikaWorkerCrashedErrorInit['kind'];
    readonly exitCode: number | undefined;

    constructor(message: string, init: ShirikaWorkerCrashedErrorInit, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ShirikaWorkerCrashedError';
        this.workerId = init.workerId;
        this.threadId = init.threadId;
        this.phase = init.phase;
        this.kind = init.kind;
        this.exitCode = init.exitCode;
    }
}

export class ShirikaOverloadError extends ShirikaError {
    override readonly code = 'SHIRIKA_RPC_OVERLOADED';
    readonly statusCode = 503;
    readonly data: unknown;

    constructor(message: string, data?: unknown, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ShirikaOverloadError';
        this.data = data;
    }
}

export interface ShirikaRemoteErrorInit {
    readonly remoteName: string;
    readonly message: string;
    readonly remoteStack?: string;
    readonly code?: string | number;
    readonly data?: unknown;
    readonly statusCode?: number;
}

export class ShirikaRemoteError extends ShirikaError {
    override readonly code: string | number;
    readonly remoteName: string;
    readonly remoteStack: string | undefined;
    readonly data: unknown;
    readonly statusCode: number | undefined;

    constructor(init: ShirikaRemoteErrorInit, options?: ErrorOptions) {
        super(init.message, options);
        this.name = 'ShirikaRemoteError';
        this.remoteName = init.remoteName;
        this.remoteStack = init.remoteStack;
        this.code = init.code ?? 'SHIRIKA_REMOTE';
        this.data = init.data;
        this.statusCode = init.statusCode;
        if (this.remoteStack) {
            this.stack = `${this.name}: ${this.message}
--- remote ${this.remoteName} ---
${this.remoteStack}`;
        }
    }
}
