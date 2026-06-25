# Benchmark baseline

Generated at: 2026-06-25T17:59:53.639Z
Mode: full
Node: v26.4.0
Platform: win32/x64

## contract-preparation

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| describeContract(raw contract) | 31578.88 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| describeContract(prepared) | 142165.39 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| getContractHash(raw contract) | 32930.15 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| getContractHash(prepared) | 164661.61 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| buildMethodIndex(raw contract) | 29541.52 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| prepared.methodIndex lookup | 42780748.66 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## frame-receive

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| empty request frame receive/read | 43953.80 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |
| small request frame receive/read | 45060.78 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |
| mixed request/response/cancel receive/read | 45694.94 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |

## aligned-bytes-payload

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| small/no-wrap | 46220.55 | 0.02 | 0.02 | 0.03 | 0.03 | 0.00 |
| small/prefix-wrap | 45354.25 | 0.02 | 0.02 | 0.03 | 0.03 | 0.00 |
| small/body-wrap | 50425.72 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |
| 1MiB/no-wrap | 5120.12 | 0.20 | 0.20 | 0.22 | 0.22 | 0.00 |
| 1MiB/prefix-wrap | 3795.01 | 0.26 | 0.26 | 0.28 | 0.28 | 0.00 |
| 1MiB/body-wrap | 3621.04 | 0.28 | 0.28 | 0.31 | 0.31 | 0.00 |
| 8MiB/no-wrap | 569.68 | 1.76 | 1.76 | 3.16 | 3.16 | 0.00 |
| 8MiB/prefix-wrap | 388.87 | 2.57 | 2.57 | 3.08 | 3.08 | 0.00 |
| 8MiB/body-wrap | 497.91 | 2.01 | 2.01 | 2.18 | 2.18 | 0.00 |
| 32MiB/no-wrap | 149.35 | 6.70 | 6.70 | 8.44 | 8.44 | 0.00 |
| 32MiB/prefix-wrap | 120.49 | 8.30 | 8.30 | 9.22 | 9.22 | 0.00 |
| 32MiB/body-wrap | 104.36 | 9.58 | 9.58 | 10.50 | 10.50 | 0.00 |

## codec-writer-fast-path

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe writer | 2943756.59 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| u32 direct trusted measured writer | 3069235.82 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct safe writer | 2521381.31 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct generic trusted writer | 2532261.01 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct specialized writer | 2925892.98 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct safe writer | 686818.85 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct generic trusted writer | 706434.20 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct specialized writer | 1028349.54 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct safe fallback | 58772.79 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct prepared specialized writer | 27479.97 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame nested safe fallback | 40980.97 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame nested prepared specialized writer | 28082.32 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## codec-read-fast-path

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe reader | 2972793.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| u32 direct validated read-side | 129878.87 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| tuple(bool,u16) direct safe reader | 2813263.98 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| tuple(bool,u16) direct validated read-side | 129248.85 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct safe reader | 2787782.82 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct validated read-side | 128202.50 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct safe reader fallback | 50568.77 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct validated read-side | 40314.73 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## pending-lifecycle

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| single request release raw map | 28650208.46 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| single request release witness | 22619439.69 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| late stale witness release raw map | 15575314.75 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| late stale witness release witness | 12954213.59 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| close many pending raw map | 14151725.75 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| close many pending witness | 8585182.52 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## node-postmessage-vs-sab

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 32B | 54033.97 | 0.02 | 0.02 | 0.02 | 0.04 | 0.16 |
| sab-binary 32B | 12980.69 | 0.08 | 0.07 | 0.12 | 0.18 | 0.31 |
| sab-msgpack 32B | 15888.46 | 0.07 | 0.06 | 0.10 | 0.15 | 0.36 |
| postMessage 4KiB | 49675.13 | 0.02 | 0.02 | 0.04 | 0.08 | 0.25 |
| sab-binary 4KiB | 12526.31 | 0.08 | 0.08 | 0.12 | 0.16 | 0.34 |
| sab-msgpack 4KiB | 14812.54 | 0.07 | 0.06 | 0.11 | 0.15 | 0.42 |
| postMessage 64KiB | 21139.12 | 0.07 | 0.06 | 0.12 | 0.18 | 0.91 |
| sab-binary 64KiB | 8865.06 | 0.12 | 0.10 | 0.20 | 0.27 | 0.73 |
| sab-msgpack 64KiB | 11098.37 | 0.10 | 0.08 | 0.19 | 0.26 | 0.57 |

## node-pool-contention

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 workers @ c=1 | 16853.59 | 0.06 | 0.06 | 0.09 | 0.14 | 0.28 |
| 1 workers @ c=8 | 4372.03 | 0.24 | 0.22 | 0.33 | 0.48 | 0.51 |
| 1 workers @ c=32 | 1244.94 | 0.81 | 0.78 | 0.97 | 1.42 | 0.78 |
| 2 workers @ c=1 | 16410.66 | 0.07 | 0.06 | 0.10 | 0.16 | 0.32 |
| 2 workers @ c=8 | 4629.99 | 0.23 | 0.21 | 0.36 | 0.49 | 0.56 |
| 2 workers @ c=32 | 1368.80 | 0.75 | 0.71 | 0.95 | 1.39 | 0.77 |
| 4 workers @ c=1 | 16279.36 | 0.07 | 0.06 | 0.10 | 0.15 | 0.31 |
| 4 workers @ c=8 | 4164.61 | 0.25 | 0.23 | 0.36 | 0.49 | 0.54 |
| 4 workers @ c=32 | 1169.37 | 0.87 | 0.81 | 1.20 | 1.80 | 1.10 |
