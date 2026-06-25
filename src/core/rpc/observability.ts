import type { RingSnapshot } from '../ring/shared-ring.js';
export interface RpcDurationStats {
    readonly count: number;
    readonly totalMs: number;
    readonly minMs: number;
    readonly maxMs: number;
    readonly avgMs: number;
}
export interface RpcHistogramBucketSnapshot {
    readonly label: string;
    readonly minInclusive: number;
    readonly maxExclusive: number | null;
    readonly count: number;
    readonly totalValue: number;
}
export interface RpcHistogramSnapshot {
    readonly unit: 'bytes' | 'milliseconds';
    readonly totalCount: number;
    readonly totalValue: number;
    readonly buckets: readonly RpcHistogramBucketSnapshot[];
}
export interface RpcMessageSizeDistributionSnapshot {
    readonly measuredAs: 'frame-size-bytes';
    readonly sent: RpcHistogramSnapshot;
    readonly received: RpcHistogramSnapshot;
}
export interface RpcRingSaturationEventSnapshot {
    readonly threshold: number;
    readonly enteredAt: number;
    readonly lastObservedAt: number;
    readonly exitedAt: number | null;
    readonly peakSaturation: number;
    readonly peakUsedBytes: number;
}
export interface RpcRingSaturationTimelineSnapshot {
    readonly thresholds: readonly number[];
    readonly droppedEvents: number;
    readonly events: readonly RpcRingSaturationEventSnapshot[];
}
export interface RpcMethodLatencyMetricsSnapshot {
    readonly stats: RpcDurationStats;
    readonly histogram: RpcHistogramSnapshot;
    readonly invocations: {
        readonly total: number;
        readonly requests: number;
        readonly notifies: number;
    };
}
export interface RpcEndpointMetricsSnapshot {
    readonly messageSizes: RpcMessageSizeDistributionSnapshot;
    readonly saturationTimeline: {
        readonly inbound: RpcRingSaturationTimelineSnapshot;
        readonly outbound: RpcRingSaturationTimelineSnapshot;
    };
}
export interface RpcTransportMetricsSnapshot {
    readonly handlerLatencyByMethod: Record<string, RpcMethodLatencyMetricsSnapshot>;
}
export interface DuplexEndpointSnapshot {
    readonly closed: boolean;
    readonly inbound: RingSnapshot;
    readonly outbound: RingSnapshot;
    readonly saturation: {
        readonly inbound: number;
        readonly outbound: number;
        readonly max: number;
    };
    readonly counters: {
        readonly framesSent: number;
        readonly framesReceived: number;
        readonly sendErrors: number;
        readonly receiveErrors: number;
    };
    readonly timings: {
        readonly encodeTimeMs: RpcDurationStats;
        readonly queueWaitMs: RpcDurationStats;
        readonly sendTimeMs: RpcDurationStats;
    };
    readonly metrics: RpcEndpointMetricsSnapshot;
}
export interface RpcTransportCounters {
    readonly callsInFlight: number;
    readonly queuedRequests: number;
    readonly completed: number;
    readonly failed: number;
    readonly timedOut: number;
    readonly cancelled: number;
    readonly notifyErrors: number;
}
export interface RpcTransportSnapshot {
    readonly at: number;
    readonly role: 'client' | 'server';
    readonly closed: boolean;
    readonly endpoint: DuplexEndpointSnapshot;
    readonly counters: RpcTransportCounters;
    readonly timings: {
        readonly encodeTimeMs: RpcDurationStats;
        readonly queueWaitMs: RpcDurationStats;
        readonly handlerTimeMs: RpcDurationStats;
        readonly responseSendTimeMs: RpcDurationStats;
    };
    readonly metrics: RpcTransportMetricsSnapshot;
}
export interface RpcFatalErrorEvent {
    readonly at: number;
    readonly role: 'client' | 'server';
    readonly phase: 'adapter' | 'receive-loop' | 'serve-loop' | 'handler' | 'shutdown';
    readonly error: unknown;
    readonly snapshot: RpcTransportSnapshot;
}
export interface RpcNotifyErrorEvent {
    readonly at: number;
    readonly methodName: string | undefined;
    readonly methodId: number;
    readonly requestId: number;
    readonly error: unknown;
    readonly snapshot: RpcTransportSnapshot;
}
export type RpcNotifyErrorPolicy = 'log' | 'throw' | 'callback';
export interface RpcTransportObserver {
    readonly onFatalError?: (event: RpcFatalErrorEvent) => void;
    readonly onNotifyError?: (event: RpcNotifyErrorEvent) => void;
}
interface MutableDurationStats {
    count: number;
    totalMs: number;
    minMs: number;
    maxMs: number;
}
interface HistogramBucketDefinition {
    readonly label: string;
    readonly minInclusive: number;
    readonly maxExclusive: number | null;
}
interface MutableHistogramBucket extends HistogramBucketDefinition {
    count: number;
    totalValue: number;
}
interface MutableHistogram {
    readonly unit: 'bytes' | 'milliseconds';
    readonly buckets: MutableHistogramBucket[];
    totalCount: number;
    totalValue: number;
}
interface MutableRingSaturationEvent {
    threshold: number;
    enteredAt: number;
    lastObservedAt: number;
    exitedAt: number | null;
    peakSaturation: number;
    peakUsedBytes: number;
}
interface MutableRingSaturationTimeline {
    readonly thresholds: readonly number[];
    readonly limit: number;
    readonly activeByThreshold: Map<number, MutableRingSaturationEvent>;
    readonly events: MutableRingSaturationEvent[];
    droppedEvents: number;
}
interface MutableMethodLatencyMetrics {
    readonly stats: MutableDurationStats;
    readonly histogram: MutableHistogram;
    totalInvocations: number;
    requestInvocations: number;
    notifyInvocations: number;
}
const FRAME_SIZE_BUCKETS: readonly HistogramBucketDefinition[] = Object.freeze([
    { label: 'small', minInclusive: 0, maxExclusive: 257 },
    { label: 'medium', minInclusive: 257, maxExclusive: 2049 },
    { label: 'large', minInclusive: 2049, maxExclusive: null },
]);
const HANDLER_LATENCY_BUCKETS: readonly HistogramBucketDefinition[] = Object.freeze([
    { label: 'under1ms', minInclusive: 0, maxExclusive: 1 },
    { label: 'under10ms', minInclusive: 1, maxExclusive: 10 },
    { label: 'under100ms', minInclusive: 10, maxExclusive: 100 },
    { label: 'over100ms', minInclusive: 100, maxExclusive: null },
]);
const DEFAULT_SATURATION_THRESHOLDS = Object.freeze([0.5, 0.8, 0.95]);
const DEFAULT_SATURATION_TIMELINE_LIMIT = 256;
export function nowMs(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }
    return Date.now();
}
export function createDurationStats(): MutableDurationStats {
    return {
        count: 0,
        totalMs: 0,
        minMs: Number.POSITIVE_INFINITY,
        maxMs: 0,
    };
}
export function recordDuration(stats: MutableDurationStats, durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) {
        return;
    }
    stats.count += 1;
    stats.totalMs += durationMs;
    stats.minMs = Math.min(stats.minMs, durationMs);
    stats.maxMs = Math.max(stats.maxMs, durationMs);
}
export function snapshotDurationStats(stats: MutableDurationStats): RpcDurationStats {
    if (stats.count === 0) {
        return {
            count: 0,
            totalMs: 0,
            minMs: 0,
            maxMs: 0,
            avgMs: 0,
        };
    }
    return {
        count: stats.count,
        totalMs: stats.totalMs,
        minMs: stats.minMs,
        maxMs: stats.maxMs,
        avgMs: stats.totalMs / stats.count,
    };
}
export function createFrameSizeHistogram(): MutableHistogram {
    return createHistogram('bytes', FRAME_SIZE_BUCKETS);
}
function createHandlerLatencyHistogram(): MutableHistogram {
    return createHistogram('milliseconds', HANDLER_LATENCY_BUCKETS);
}
export function recordHistogramValue(histogram: MutableHistogram, value: number): void {
    if (!Number.isFinite(value) || value < 0) {
        return;
    }
    const bucket = histogram.buckets.find(
        (candidate) => value >= candidate.minInclusive && (candidate.maxExclusive === null || value < candidate.maxExclusive),
    );
    if (!bucket) {
        return;
    }
    histogram.totalCount += 1;
    histogram.totalValue += value;
    bucket.count += 1;
    bucket.totalValue += value;
}
export function snapshotHistogram(histogram: MutableHistogram): RpcHistogramSnapshot {
    return {
        unit: histogram.unit,
        totalCount: histogram.totalCount,
        totalValue: histogram.totalValue,
        buckets: histogram.buckets.map((bucket) => ({
            label: bucket.label,
            minInclusive: bucket.minInclusive,
            maxExclusive: bucket.maxExclusive,
            count: bucket.count,
            totalValue: bucket.totalValue,
        })),
    };
}
export function createRingSaturationTimeline(
    limit = DEFAULT_SATURATION_TIMELINE_LIMIT,
    thresholds: readonly number[] = DEFAULT_SATURATION_THRESHOLDS,
): MutableRingSaturationTimeline {
    return {
        thresholds: [...thresholds].sort((left, right) => left - right),
        limit: Math.max(1, Math.trunc(limit) || DEFAULT_SATURATION_TIMELINE_LIMIT),
        activeByThreshold: new Map<number, MutableRingSaturationEvent>(),
        events: [],
        droppedEvents: 0,
    };
}
export function observeRingSaturation(timeline: MutableRingSaturationTimeline, snapshot: RingSnapshot, observedAt = nowMs()): void {
    observeRingSaturationSample(timeline, snapshot.usedBytes, snapshot.capacityBytes, observedAt);
}
export function observeRingSaturationSample(timeline: MutableRingSaturationTimeline, usedBytes: number, capacityBytes: number, observedAt = nowMs()): void {
    const saturation = capacityBytes <= 0 ? 0 : usedBytes / capacityBytes;
    for (const threshold of timeline.thresholds) {
        const aboveThreshold = saturation > threshold;
        const active = timeline.activeByThreshold.get(threshold);
        if (aboveThreshold) {
            if (active) {
                active.lastObservedAt = observedAt;
                active.peakSaturation = Math.max(active.peakSaturation, saturation);
                active.peakUsedBytes = Math.max(active.peakUsedBytes, usedBytes);
                continue;
            }
            const event: MutableRingSaturationEvent = {
                threshold,
                enteredAt: observedAt,
                lastObservedAt: observedAt,
                exitedAt: null,
                peakSaturation: saturation,
                peakUsedBytes: usedBytes,
            };
            timeline.activeByThreshold.set(threshold, event);
            timeline.events.push(event);
            trimSaturationTimeline(timeline);
            continue;
        }
        if (!active) {
            continue;
        }
        active.lastObservedAt = observedAt;
        active.exitedAt = observedAt;
        timeline.activeByThreshold.delete(threshold);
    }
}
export function snapshotRingSaturationTimeline(timeline: MutableRingSaturationTimeline): RpcRingSaturationTimelineSnapshot {
    return {
        thresholds: [...timeline.thresholds],
        droppedEvents: timeline.droppedEvents,
        events: timeline.events.map((event) => ({
            threshold: event.threshold,
            enteredAt: event.enteredAt,
            lastObservedAt: event.lastObservedAt,
            exitedAt: event.exitedAt,
            peakSaturation: event.peakSaturation,
            peakUsedBytes: event.peakUsedBytes,
        })),
    };
}
export function createMethodLatencyMetrics(): MutableMethodLatencyMetrics {
    return {
        stats: createDurationStats(),
        histogram: createHandlerLatencyHistogram(),
        totalInvocations: 0,
        requestInvocations: 0,
        notifyInvocations: 0,
    };
}
export function recordMethodLatency(metrics: MutableMethodLatencyMetrics, durationMs: number, kind: 'request' | 'notify'): void {
    metrics.totalInvocations += 1;
    if (kind === 'request') {
        metrics.requestInvocations += 1;
    } else {
        metrics.notifyInvocations += 1;
    }
    recordDuration(metrics.stats, durationMs);
    recordHistogramValue(metrics.histogram, durationMs);
}
export function snapshotMethodLatencyMetrics(metrics: MutableMethodLatencyMetrics): RpcMethodLatencyMetricsSnapshot {
    return {
        stats: snapshotDurationStats(metrics.stats),
        histogram: snapshotHistogram(metrics.histogram),
        invocations: {
            total: metrics.totalInvocations,
            requests: metrics.requestInvocations,
            notifies: metrics.notifyInvocations,
        },
    };
}
export function safeInvokeHook<T>(hook: ((event: T) => void) | undefined, event: T, hookName: string): void {
    if (!hook) {
        return;
    }
    try {
        hook(event);
    } catch (error) {
        console.error(`[shirika-rpc] ${hookName} hook failed`, error);
    }
}
export function ringSaturation(snapshot: RingSnapshot): number {
    if (snapshot.capacityBytes <= 0) {
        return 0;
    }
    return snapshot.usedBytes / snapshot.capacityBytes;
}
function createHistogram(unit: 'bytes' | 'milliseconds', definitions: readonly HistogramBucketDefinition[]): MutableHistogram {
    return {
        unit,
        totalCount: 0,
        totalValue: 0,
        buckets: definitions.map((definition) => ({
            ...definition,
            count: 0,
            totalValue: 0,
        })),
    };
}
function trimSaturationTimeline(timeline: MutableRingSaturationTimeline): void {
    while (timeline.events.length > timeline.limit) {
        const removableIndex = timeline.events.findIndex((event) => event.exitedAt !== null);
        if (removableIndex < 0) {
            return;
        }
        timeline.events.splice(removableIndex, 1);
        timeline.droppedEvents += 1;
    }
}
