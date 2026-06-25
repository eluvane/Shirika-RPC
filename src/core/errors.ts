export class ShirikaError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ShirikaError';
    }
}

export class ShirikaTimeoutError extends ShirikaError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ShirikaTimeoutError';
    }
}

export class ShirikaClosedError extends ShirikaError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ShirikaClosedError';
    }
}

export class ShirikaOversizeError extends ShirikaError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ShirikaOversizeError';
    }
}

export class ShirikaProtocolError extends ShirikaError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ShirikaProtocolError';
    }
}

export class ShirikaEnvironmentError extends ShirikaError {
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
    readonly code = 'SHIRIKA_RPC_OVERLOADED';
    readonly statusCode = 503;
    readonly data: unknown;

    constructor(message: string, data?: unknown, options?: ErrorOptions) {
        super(message, options);
        this.name = 'ShirikaOverloadError';
        this.data = data;
    }
}

export interface ShirikaRemoteErrorInit {
    remoteName: string;
    message: string;
    remoteStack?: string;
    code?: string | number;
    data?: unknown;
    statusCode?: number;
}

export class ShirikaRemoteError extends ShirikaError {
    readonly remoteName: string;
    readonly remoteStack: string | undefined;
    readonly code: string | number | undefined;
    readonly data: unknown;
    readonly statusCode: number | undefined;

    constructor(init: ShirikaRemoteErrorInit, options?: ErrorOptions) {
        super(init.message, options);
        this.name = 'ShirikaRemoteError';
        this.remoteName = init.remoteName;
        this.remoteStack = init.remoteStack;
        this.code = init.code;
        this.data = init.data;
        this.statusCode = init.statusCode;
        if (this.remoteStack) {
            this.stack = `${this.name}: ${this.message}
--- remote ${this.remoteName} ---
${this.remoteStack}`;
        }
    }
}
