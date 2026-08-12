# Benchmark baseline

Generated at: 2026-08-12T16:16:29.510Z
Mode: full
Node: v24.11.0
Platform: win32/x64

## contract-preparation

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| describeContract(raw contract) | 30981.80 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| describeContract(prepared) | 133390.02 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| getContractHash(raw contract) | 32128.82 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| getContractHash(prepared) | 153133.85 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| buildMethodIndex(raw contract) | 30342.90 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| prepared.methodIndex lookup | 38844002.49 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## frame-receive

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| empty request frame receive/read | 42141.24 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |
| small request frame receive/read | 42601.91 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |
| mixed request/response/cancel receive/read | 43423.22 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |

## aligned-bytes-payload

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| small/no-wrap | 42655.47 | 0.02 | 0.02 | 0.03 | 0.03 | 0.00 |
| small/prefix-wrap | 43404.66 | 0.02 | 0.02 | 0.03 | 0.03 | 0.00 |
| small/body-wrap | 44138.91 | 0.02 | 0.02 | 0.03 | 0.03 | 0.00 |
| 1MiB/no-wrap | 3568.78 | 0.28 | 0.28 | 0.80 | 0.80 | 0.00 |
| 1MiB/prefix-wrap | 3871.77 | 0.26 | 0.26 | 0.28 | 0.28 | 0.00 |
| 1MiB/body-wrap | 3757.25 | 0.27 | 0.27 | 0.30 | 0.30 | 0.00 |
| 8MiB/no-wrap | 557.48 | 1.79 | 1.79 | 3.06 | 3.06 | 0.00 |
| 8MiB/prefix-wrap | 482.61 | 2.07 | 2.07 | 2.59 | 2.59 | 0.00 |
| 8MiB/body-wrap | 498.54 | 2.01 | 2.01 | 2.36 | 2.36 | 0.00 |
| 32MiB/no-wrap | 175.45 | 5.70 | 5.70 | 6.32 | 6.32 | 0.00 |
| 32MiB/prefix-wrap | 131.62 | 7.60 | 7.60 | 7.94 | 7.94 | 0.00 |
| 32MiB/body-wrap | 121.99 | 8.20 | 8.20 | 8.82 | 8.82 | 0.00 |

## codec-writer-fast-path

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe writer | 2534276.08 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| u32 direct trusted measured writer | 2549706.53 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct safe writer | 2434345.70 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct generic trusted writer | 2445382.38 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct specialized writer | 2642706.13 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct safe writer | 727339.38 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct generic trusted writer | 721146.91 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct specialized writer | 950912.02 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct safe fallback | 60012.82 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct prepared specialized writer | 27656.06 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame nested safe fallback | 51272.87 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame nested prepared specialized writer | 30611.27 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## codec-read-fast-path

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe reader | 2944779.49 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| u32 direct validated read-side | 148079.40 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| tuple(bool,u16) direct safe reader | 2970523.50 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| tuple(bool,u16) direct validated read-side | 142443.32 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct safe reader | 2830223.39 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct validated read-side | 146467.98 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct safe reader fallback | 67742.06 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct validated read-side | 46903.15 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## pending-lifecycle

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| single request release raw map | 29058549.49 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| single request release witness | 22499151.78 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| late stale witness release raw map | 16096620.93 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| late stale witness release witness | 13376630.81 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| close many pending raw map | 13079733.01 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| close many pending witness | 8193296.25 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## node-postmessage-vs-sab

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 32B | 55869.24 | 0.02 | 0.02 | 0.02 | 0.05 | 0.13 |
| sab-binary 32B | 11422.93 | 0.09 | 0.08 | 0.14 | 0.20 | 0.47 |
| sab-msgpack 32B | 15608.51 | 0.07 | 0.06 | 0.10 | 0.16 | 0.35 |
| postMessage 4KiB | 51195.37 | 0.02 | 0.02 | 0.03 | 0.06 | 0.22 |
| sab-binary 4KiB | 10882.02 | 0.10 | 0.08 | 0.18 | 0.22 | 0.66 |
| sab-msgpack 4KiB | 13809.26 | 0.08 | 0.06 | 0.14 | 0.17 | 0.61 |
| postMessage 64KiB | 20754.98 | 0.07 | 0.06 | 0.12 | 0.27 | 0.86 |
| sab-binary 64KiB | 8733.66 | 0.14 | 0.11 | 0.27 | 0.40 | 0.74 |
| sab-msgpack 64KiB | 10394.65 | 0.12 | 0.09 | 0.22 | 0.33 | 0.72 |

## node-pool-contention

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 workers @ c=1 | 15105.79 | 0.07 | 0.06 | 0.13 | 0.23 | 0.45 |
| 1 workers @ c=8 | 3975.00 | 0.27 | 0.24 | 0.43 | 0.60 | 0.75 |
| 1 workers @ c=32 | 1216.95 | 0.84 | 0.80 | 1.01 | 1.50 | 0.80 |
| 2 workers @ c=1 | 16483.06 | 0.06 | 0.06 | 0.09 | 0.15 | 0.29 |
| 2 workers @ c=8 | 4004.25 | 0.25 | 0.24 | 0.32 | 0.46 | 0.51 |
| 2 workers @ c=32 | 1110.92 | 0.91 | 0.85 | 1.14 | 1.73 | 1.04 |
| 4 workers @ c=1 | 16641.71 | 0.06 | 0.06 | 0.09 | 0.13 | 0.28 |
| 4 workers @ c=8 | 4480.61 | 0.24 | 0.22 | 0.34 | 0.50 | 0.42 |
| 4 workers @ c=32 | 1276.83 | 0.80 | 0.76 | 0.96 | 1.60 | 0.79 |

