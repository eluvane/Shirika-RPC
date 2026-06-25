// @ts-expect-error internal type stays private
import type { PendingRequestId as _PendingRequestIdMustNotBePublic } from 'shirika-rpc';

type _PendingRequestIdMustNotBePublicUsage = _PendingRequestIdMustNotBePublic;

import {
    codecs,
    defineContract,
    method,
    type PreparedBinaryCodec,
    type PreparedContract,
    prepareBinaryCodec,
    prepareContract,
    type RpcClient,
    type RpcClientControl,
    type RpcDurationStats,
    type RpcFatalErrorEvent,
    type RpcNotifyErrorEvent,
    type RpcTransportSnapshot,
    type ShirikaBootstrapMessage,
    ShirikaClosedError,
    ShirikaWorkerCrashedError,
} from 'shirika-rpc';
import { expectError, expectType } from 'tsd';
import type { exampleContract } from '../shared/contract.mjs';

declare const client: RpcClient<typeof exampleContract>;
declare const managedClient: RpcClientControl<typeof exampleContract>;
declare const fatalEvent: RpcFatalErrorEvent;
declare const notifyEvent: RpcNotifyErrorEvent;
declare const snapshot: RpcTransportSnapshot;
declare const duration: RpcDurationStats;
declare const bootstrap: ShirikaBootstrapMessage;
expectType<
    Promise<{
        text: string;
    }>
>(client.call('ping', { text: 'hello' }));
expectType<
    Promise<{
        value: number;
    }>
>(client.call('sum', { a: 1, b: 2 }));
expectType<Promise<Uint8Array>>(client.call('echoBytes', new Uint8Array()));
expectType<Promise<unknown>>(client.call('dynamic', { anything: true }));
expectType<Promise<void>>(client.notify('ping', { text: 'notify' }));
expectType<RpcTransportSnapshot>(managedClient.snapshot());
expectType<number>(snapshot.endpoint.saturation.max);
expectType<number>(snapshot.counters.completed);
expectType<number>(snapshot.endpoint.metrics.messageSizes.sent.totalCount);
expectType<number | undefined>(snapshot.endpoint.metrics.messageSizes.sent.buckets[0]?.count);
expectType<number | null | undefined>(snapshot.endpoint.metrics.saturationTimeline.inbound.events[0]?.exitedAt);
expectType<number>(snapshot.metrics.handlerLatencyByMethod.ping?.stats.avgMs ?? 0);
expectType<'client' | 'server'>(fatalEvent.role);
expectType<number>(notifyEvent.snapshot.counters.notifyErrors);
expectType<number>(duration.avgMs);
expectType<'shirika-rpc/bootstrap'>(bootstrap.type);
expectType<typeof ShirikaClosedError>(ShirikaClosedError);
expectType<typeof ShirikaWorkerCrashedError>(ShirikaWorkerCrashedError);
expectError(client.call('missing', { text: 'nope' }));
expectError(client.call('ping', { nope: true }));
expectError(client.call('sum', { a: 'bad', b: 2 }));
const customContract = defineContract({
    foo: method(1, codecs.u32(), codecs.string()),
});
declare const customClient: RpcClient<typeof customContract>;
expectType<Promise<string>>(customClient.call('foo', 123));

expectType<PreparedContract<typeof customContract>>(prepareContract(customContract));
expectType<string>(prepareContract(customContract).hash);

const preparedU32 = prepareBinaryCodec(codecs.u32());
expectType<PreparedBinaryCodec<number> | undefined>(preparedU32);
expectType<string | undefined>(preparedU32?.witness.signature);
