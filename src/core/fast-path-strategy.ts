export type FastPathFlag =
    | 'preparedContractReuse'
    | 'validatedFrameWitness'
    | 'validatedAlignedBytesPayload'
    | 'preparedBinaryCodecWriter'
    | 'specializedCompositeWriter'
    | 'readSideEncodedPayload'
    | 'pendingRequestWitness';

export type FastPathMode = 'default' | 'safe' | 'experimental' | 'paranoid';
export type FastPathGateLevel = 'required' | 'manual' | 'paranoid';

export interface FastPathKillSwitch {
    readonly disableEnv: string;
    readonly enableEnv: string;
}

export interface FastPathPolicy {
    readonly flag: FastPathFlag;
    readonly title: string;
    readonly defaultEnabled: boolean;
    readonly experimental: boolean;
    readonly killSwitch: FastPathKillSwitch;
    readonly fallback: string;
    readonly conformanceVectors: readonly string[];
    readonly leanModules: readonly string[];
    readonly benchmarkSuites: readonly string[];
    readonly gateLevel: FastPathGateLevel;
}

export type FastPathSwitches = { readonly [Flag in FastPathFlag]: boolean };
export type FastPathStrategy = FastPathSwitches & {
    readonly mode: FastPathMode;
    readonly source: string;
};
export type FastPathStrategyOverride = Partial<FastPathSwitches> & {
    readonly mode?: FastPathMode;
};

const FAST_PATH_MODE_ENV = 'SHIRIKA_RPC_FAST_PATH_MODE';
const DISABLE_ALL_FAST_PATHS_ENV = 'SHIRIKA_RPC_DISABLE_FAST_PATHS';

const fastPathPolicy = [
    {
        flag: 'preparedContractReuse',
        title: 'Prepared contract reuse',
        defaultEnabled: true,
        experimental: false,
        killSwitch: {
            disableEnv: 'SHIRIKA_RPC_DISABLE_PREPARED_CONTRACT_REUSE',
            enableEnv: 'SHIRIKA_RPC_ENABLE_PREPARED_CONTRACT_REUSE',
        },
        fallback: 'Revalidate the raw contract and rebuild description/hash/index on demand.',
        conformanceVectors: ['formal/fixtures/contract-hash-vectors.json'],
        leanModules: ['Shirika.Contract'],
        benchmarkSuites: ['bench/contract-preparation.mjs'],
        gateLevel: 'required',
    },
    {
        flag: 'validatedFrameWitness',
        title: 'Validated frame witness downstream reuse',
        defaultEnabled: true,
        experimental: false,
        killSwitch: {
            disableEnv: 'SHIRIKA_RPC_DISABLE_VALIDATED_FRAME_WITNESS',
            enableEnv: 'SHIRIKA_RPC_ENABLE_VALIDATED_FRAME_WITNESS',
        },
        fallback: 'Keep receive-boundary validation and route downstream decoding through checked readers without witness-only specializations.',
        conformanceVectors: ['formal/fixtures/frame-layout-golden.json'],
        leanModules: ['Shirika.Frame', 'Shirika.Align', 'Shirika.Ring'],
        benchmarkSuites: ['bench/frame-receive.mjs'],
        gateLevel: 'required',
    },
    {
        flag: 'validatedAlignedBytesPayload',
        title: 'Validated aligned-bytes payload range',
        defaultEnabled: true,
        experimental: false,
        killSwitch: {
            disableEnv: 'SHIRIKA_RPC_DISABLE_VALIDATED_ALIGNED_BYTES',
            enableEnv: 'SHIRIKA_RPC_ENABLE_VALIDATED_ALIGNED_BYTES',
        },
        fallback: 'Use ordinary binary bytes payload encoding on send and revalidate the aligned prefix before every receive-side copy.',
        conformanceVectors: ['formal/fixtures/frame-layout-golden.json'],
        leanModules: ['Shirika.Frame', 'Shirika.Align', 'Shirika.Ring'],
        benchmarkSuites: ['bench/aligned-bytes-payload.mjs', 'bench/node-postmessage-vs-sab.mjs'],
        gateLevel: 'required',
    },
    {
        flag: 'preparedBinaryCodecWriter',
        title: 'Prepared binary codec measured writer',
        defaultEnabled: true,
        experimental: false,
        killSwitch: {
            disableEnv: 'SHIRIKA_RPC_DISABLE_PREPARED_BINARY_CODEC_WRITER',
            enableEnv: 'SHIRIKA_RPC_ENABLE_PREPARED_BINARY_CODEC_WRITER',
        },
        fallback: 'Use checked RingBinaryWriter with per-primitive capacity checks and finish() validation.',
        conformanceVectors: ['formal/fixtures/codec-vectors.json'],
        leanModules: ['Shirika.Codec.Core', 'Shirika.Codec.Builtins', 'Shirika.Codec.Combinators'],
        benchmarkSuites: ['bench/codec-writer-fast-path.mjs'],
        gateLevel: 'required',
    },
    {
        flag: 'specializedCompositeWriter',
        title: 'Specialized composite measured writer',
        defaultEnabled: true,
        experimental: false,
        killSwitch: {
            disableEnv: 'SHIRIKA_RPC_DISABLE_SPECIALIZED_COMPOSITE_WRITER',
            enableEnv: 'SHIRIKA_RPC_ENABLE_SPECIALIZED_COMPOSITE_WRITER',
        },
        fallback: 'Use the generic checked composite codec writer even when a prepared codec witness exists.',
        conformanceVectors: ['formal/fixtures/codec-vectors.json'],
        leanModules: ['Shirika.Codec.Combinators', 'Shirika.Codec.Examples'],
        benchmarkSuites: ['bench/codec-writer-fast-path.mjs'],
        gateLevel: 'required',
    },
    {
        flag: 'readSideEncodedPayload',
        title: 'Read-side validated encoded payload specialization',
        defaultEnabled: false,
        experimental: true,
        killSwitch: {
            disableEnv: 'SHIRIKA_RPC_DISABLE_READ_SIDE_ENCODED_PAYLOAD',
            enableEnv: 'SHIRIKA_RPC_ENABLE_READ_SIDE_ENCODED_PAYLOAD',
        },
        fallback: 'Use RingBinaryReader underflow checks plus assertFullyRead() for inbound payload decoding.',
        conformanceVectors: ['formal/fixtures/codec-vectors.json'],
        leanModules: ['Shirika.Codec.Core', 'Shirika.Codec.Builtins', 'Shirika.Codec.Combinators'],
        benchmarkSuites: ['bench/codec-read-fast-path.mjs'],
        gateLevel: 'manual',
    },
    {
        flag: 'pendingRequestWitness',
        title: 'Pending request lifecycle witness',
        defaultEnabled: true,
        experimental: false,
        killSwitch: {
            disableEnv: 'SHIRIKA_RPC_DISABLE_PENDING_REQUEST_WITNESS',
            enableEnv: 'SHIRIKA_RPC_ENABLE_PENDING_REQUEST_WITNESS',
        },
        fallback: 'Release locally owned pending entries by checked request-id plus entry identity rather than by witness object identity.',
        conformanceVectors: ['formal/fixtures/lifecycle-vectors.json'],
        leanModules: ['Shirika.Lifecycle'],
        benchmarkSuites: ['bench/pending-lifecycle.mjs'],
        gateLevel: 'required',
    },
] as const satisfies readonly FastPathPolicy[];

export const FAST_PATH_MODE_ENV_VAR = FAST_PATH_MODE_ENV;
export const FAST_PATH_DISABLE_ALL_ENV_VAR = DISABLE_ALL_FAST_PATHS_ENV;
export const FAST_PATH_POLICY: readonly FastPathPolicy[] = Object.freeze(
    fastPathPolicy.map((policy) =>
        Object.freeze({
            ...policy,
            killSwitch: Object.freeze({ ...policy.killSwitch }),
            conformanceVectors: Object.freeze([...policy.conformanceVectors]),
            leanModules: Object.freeze([...policy.leanModules]),
            benchmarkSuites: Object.freeze([...policy.benchmarkSuites]),
        }),
    ),
);
export const FAST_PATH_FLAGS: readonly FastPathFlag[] = Object.freeze(fastPathPolicy.map((policy) => policy.flag));

let strategyOverrideForTest: FastPathStrategyOverride | undefined;

export function getFastPathStrategy(): FastPathStrategy {
    const env = getRuntimeEnv();
    const mode = readMode(env[FAST_PATH_MODE_ENV]) ?? 'default';
    const base = createSwitchesForMode(mode);
    applyPerFlagEnvironmentOverrides(base, env);
    if (isTruthy(env[DISABLE_ALL_FAST_PATHS_ENV])) {
        disableAll(base);
    }
    if (strategyOverrideForTest !== undefined) {
        const overrideMode = strategyOverrideForTest.mode;
        if (overrideMode !== undefined) {
            Object.assign(base, createSwitchesForMode(overrideMode));
        }
        for (const flag of FAST_PATH_FLAGS) {
            const value = strategyOverrideForTest[flag];
            if (value !== undefined) {
                base[flag] = value;
            }
        }
        return freezeStrategy(base, overrideMode ?? mode, 'test-override');
    }
    return freezeStrategy(base, mode, 'environment');
}

export function isFastPathEnabled(flag: FastPathFlag): boolean {
    return getFastPathStrategy()[flag];
}

export function setFastPathStrategyForTest(override: FastPathStrategyOverride | undefined): void {
    strategyOverrideForTest = override === undefined ? undefined : Object.freeze({ ...override });
}

export function withFastPathStrategyForTest<T>(override: FastPathStrategyOverride, fn: () => T): T {
    const previous = strategyOverrideForTest;
    strategyOverrideForTest = Object.freeze({ ...override });
    try {
        return fn();
    } finally {
        strategyOverrideForTest = previous;
    }
}

function createSwitchesForMode(mode: FastPathMode): Record<FastPathFlag, boolean> {
    const switches = Object.create(null) as Record<FastPathFlag, boolean>;
    for (const policy of fastPathPolicy) {
        switches[policy.flag] = mode === 'experimental' ? true : mode === 'default' ? policy.defaultEnabled : false;
    }
    return switches;
}

function applyPerFlagEnvironmentOverrides(switches: Record<FastPathFlag, boolean>, env: Record<string, string | undefined>): void {
    for (const policy of fastPathPolicy) {
        if (isTruthy(env[policy.killSwitch.enableEnv])) {
            switches[policy.flag] = true;
        }
        if (isTruthy(env[policy.killSwitch.disableEnv])) {
            switches[policy.flag] = false;
        }
    }
}

function disableAll(switches: Record<FastPathFlag, boolean>): void {
    for (const flag of FAST_PATH_FLAGS) {
        switches[flag] = false;
    }
}

function freezeStrategy(switches: Record<FastPathFlag, boolean>, mode: FastPathMode, source: string): FastPathStrategy {
    return Object.freeze({ ...switches, mode, source }) as FastPathStrategy;
}

function readMode(value: string | undefined): FastPathMode | undefined {
    switch (value) {
        case 'default':
        case 'safe':
        case 'experimental':
        case 'paranoid':
            return value;
        case 'off':
        case 'disabled':
            return 'safe';
        case undefined:
        case '':
            return undefined;
        default:
            return undefined;
    }
}

function isTruthy(value: string | undefined): boolean {
    return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

function getRuntimeEnv(): Record<string, string | undefined> {
    const globalProcess = (globalThis as { readonly process?: { readonly env?: Record<string, string | undefined> } }).process;
    return globalProcess?.env ?? {};
}
