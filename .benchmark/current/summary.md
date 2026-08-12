# Benchmark baseline

Generated at: 2026-08-12T15:36:45.162Z
Mode: full
Node: v26.0.0
Platform: win32/x64

## contract-preparation

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| describeContract(raw contract) | 32848.94 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| describeContract(prepared) | 135592.36 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| getContractHash(raw contract) | 33693.08 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| getContractHash(prepared) | 162785.72 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| buildMethodIndex(raw contract) | 32251.51 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| prepared.methodIndex lookup | 41898856.16 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## frame-receive

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| empty request frame receive/read | 44650.49 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |
| small request frame receive/read | 44801.03 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |
| mixed request/response/cancel receive/read | 46070.08 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |

## aligned-bytes-payload

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| small/no-wrap | 44461.44 | 0.02 | 0.02 | 0.03 | 0.03 | 0.00 |
| small/prefix-wrap | 47016.01 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |
| small/body-wrap | 45218.18 | 0.02 | 0.02 | 0.04 | 0.04 | 0.00 |
| 1MiB/no-wrap | 5371.61 | 0.19 | 0.19 | 0.23 | 0.23 | 0.00 |
| 1MiB/prefix-wrap | 3771.99 | 0.27 | 0.27 | 0.30 | 0.30 | 0.00 |
| 1MiB/body-wrap | 3791.10 | 0.26 | 0.26 | 0.31 | 0.31 | 0.00 |
| 8MiB/no-wrap | 612.47 | 1.63 | 1.63 | 3.26 | 3.26 | 0.00 |
| 8MiB/prefix-wrap | 422.87 | 2.36 | 2.36 | 3.33 | 3.33 | 0.00 |
| 8MiB/body-wrap | 486.89 | 2.05 | 2.05 | 3.15 | 3.15 | 0.00 |
| 32MiB/no-wrap | 167.20 | 5.98 | 5.98 | 6.73 | 6.73 | 0.00 |
| 32MiB/prefix-wrap | 122.10 | 8.19 | 8.19 | 8.53 | 8.53 | 0.00 |
| 32MiB/body-wrap | 132.68 | 7.54 | 7.54 | 8.15 | 8.15 | 0.00 |

## codec-writer-fast-path

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe writer | 3003291.61 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| u32 direct trusted measured writer | 2877764.09 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct safe writer | 2591250.90 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct generic trusted writer | 2426795.71 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct specialized writer | 2698720.27 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct safe writer | 681035.61 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct generic trusted writer | 701515.13 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct specialized writer | 933103.91 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct safe fallback | 61361.47 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct prepared specialized writer | 28316.86 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame nested safe fallback | 50802.67 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame nested prepared specialized writer | 31596.01 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## codec-read-fast-path

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe reader | 3168507.57 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| u32 direct validated read-side | 149381.20 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| tuple(bool,u16) direct safe reader | 2953991.58 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| tuple(bool,u16) direct validated read-side | 148739.38 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct safe reader | 2809036.11 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct validated read-side | 150405.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct safe reader fallback | 69626.90 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct validated read-side | 48783.74 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## pending-lifecycle

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| single request release raw map | 27981389.02 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| single request release witness | 21696699.24 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| late stale witness release raw map | 15277643.67 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| late stale witness release witness | 13155035.25 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| close many pending raw map | 14996640.75 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| close many pending witness | 8512666.85 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## node-postmessage-vs-sab

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 32B | 56603.94 | 0.02 | 0.02 | 0.02 | 0.05 | 0.20 |
| sab-binary 32B | 12727.25 | 0.08 | 0.07 | 0.12 | 0.17 | 0.31 |
| sab-msgpack 32B | 15887.06 | 0.07 | 0.06 | 0.10 | 0.16 | 0.37 |
| postMessage 4KiB | 51261.75 | 0.02 | 0.02 | 0.03 | 0.07 | 0.27 |
| sab-binary 4KiB | 10390.20 | 0.11 | 0.09 | 0.19 | 0.27 | 0.58 |
| sab-msgpack 4KiB | 12343.19 | 0.10 | 0.07 | 0.19 | 0.25 | 0.76 |
| postMessage 64KiB | 19754.50 | 0.07 | 0.06 | 0.12 | 0.22 | 0.96 |
| sab-binary 64KiB | 9398.19 | 0.12 | 0.10 | 0.21 | 0.29 | 0.59 |
| sab-msgpack 64KiB | 10004.73 | 0.12 | 0.10 | 0.22 | 0.32 | 0.89 |

## node-pool-contention

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 workers @ c=1 | 16228.32 | 0.07 | 0.06 | 0.12 | 0.21 | 0.37 |
| 1 workers @ c=8 | 4267.94 | 0.25 | 0.23 | 0.38 | 0.52 | 0.61 |
| 1 workers @ c=32 | 1263.46 | 0.81 | 0.76 | 1.01 | 1.39 | 0.87 |
| 2 workers @ c=1 | 16736.03 | 0.06 | 0.06 | 0.09 | 0.15 | 0.33 |
| 2 workers @ c=8 | 4600.26 | 0.22 | 0.21 | 0.32 | 0.45 | 0.57 |
| 2 workers @ c=32 | 1336.07 | 0.76 | 0.72 | 1.00 | 1.39 | 0.85 |
| 4 workers @ c=1 | 14459.93 | 0.08 | 0.06 | 0.15 | 0.19 | 0.68 |
| 4 workers @ c=8 | 4281.40 | 0.29 | 0.22 | 0.54 | 0.63 | 0.85 |
| 4 workers @ c=32 | 1238.23 | 0.85 | 0.75 | 1.41 | 1.76 | 1.41 |

