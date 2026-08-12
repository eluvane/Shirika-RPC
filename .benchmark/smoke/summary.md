# Benchmark baseline

Generated at: 2026-08-12T16:16:51.125Z
Mode: smoke
Node: v24.11.0
Platform: win32/x64

## contract-preparation

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| describeContract(raw contract) | 31089.09 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| describeContract(prepared) | 131812.74 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| getContractHash(raw contract) | 33365.56 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| getContractHash(prepared) | 151224.16 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| buildMethodIndex(raw contract) | 30673.15 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| prepared.methodIndex lookup | 19157088.12 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## frame-receive

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| empty request frame receive/read | 35318.47 | 0.03 | 0.03 | 0.03 | 0.03 | 0.00 |
| small request frame receive/read | 38780.28 | 0.03 | 0.03 | 0.03 | 0.03 | 0.00 |
| mixed request/response/cancel receive/read | 41477.25 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |

## aligned-bytes-payload

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| small/no-wrap | 10997.07 | 0.09 | 0.09 | 0.16 | 0.16 | 0.00 |
| small/prefix-wrap | 17688.68 | 0.06 | 0.06 | 0.06 | 0.06 | 0.00 |
| small/body-wrap | 14388.49 | 0.07 | 0.07 | 0.12 | 0.12 | 0.00 |
| 1MiB/no-wrap | 4340.28 | 0.23 | 0.23 | 0.26 | 0.26 | 0.00 |
| 1MiB/prefix-wrap | 3323.00 | 0.30 | 0.30 | 0.32 | 0.32 | 0.00 |
| 1MiB/body-wrap | 3419.19 | 0.29 | 0.29 | 0.31 | 0.31 | 0.00 |

## codec-writer-fast-path

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe writer | 1289102.78 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| u32 direct trusted measured writer | 1510802.24 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct safe writer | 1399645.42 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct generic trusted writer | 1200816.56 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct specialized writer | 1665833.75 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct safe writer | 504464.51 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct generic trusted writer | 516564.50 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct specialized writer | 440709.84 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct safe fallback | 53643.85 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct prepared specialized writer | 26398.11 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame nested safe fallback | 46470.42 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame nested prepared specialized writer | 29757.18 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## codec-read-fast-path

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe reader | 1201297.40 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| u32 direct validated read-side | 116977.76 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| tuple(bool,u16) direct safe reader | 1375894.33 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| tuple(bool,u16) direct validated read-side | 127153.67 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct safe reader | 1371553.97 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct validated read-side | 130847.81 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct safe reader fallback | 59145.58 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct validated read-side | 44856.59 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## pending-lifecycle

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| single request release raw map | 26886056.89 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| single request release witness | 16944557.41 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| late stale witness release raw map | 13922147.35 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| late stale witness release witness | 9971481.56 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| close many pending raw map | 11001100.11 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| close many pending witness | 6763245.82 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## node-postmessage-vs-sab

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 32B | 52835.91 | 0.02 | 0.02 | 0.03 | 0.04 | 0.19 |
| sab-binary 32B | 11397.20 | 0.09 | 0.08 | 0.14 | 0.21 | 0.51 |
| sab-msgpack 32B | 15138.18 | 0.07 | 0.06 | 0.11 | 0.17 | 0.44 |
| postMessage 64KiB | 23388.71 | 0.06 | 0.06 | 0.10 | 0.23 | 0.70 |
| sab-binary 64KiB | 9702.45 | 0.12 | 0.10 | 0.17 | 0.25 | 0.38 |
| sab-msgpack 64KiB | 10262.98 | 0.10 | 0.09 | 0.16 | 0.22 | 0.64 |

## node-pool-contention

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 workers @ c=1 | 15800.51 | 0.07 | 0.06 | 0.10 | 0.16 | 0.33 |
| 1 workers @ c=8 | 4358.20 | 0.24 | 0.22 | 0.30 | 0.48 | 0.42 |
| 1 workers @ c=32 | 1256.78 | 0.81 | 0.78 | 0.90 | 1.51 | 0.67 |
| 2 workers @ c=1 | 16300.53 | 0.06 | 0.06 | 0.09 | 0.14 | 0.31 |
| 2 workers @ c=8 | 4269.87 | 0.23 | 0.21 | 0.34 | 0.47 | 0.70 |
| 2 workers @ c=32 | 1325.36 | 0.78 | 0.73 | 0.95 | 1.59 | 0.76 |
| 4 workers @ c=1 | 15948.59 | 0.07 | 0.06 | 0.11 | 0.15 | 0.33 |
| 4 workers @ c=8 | 4547.33 | 0.23 | 0.21 | 0.31 | 0.48 | 0.43 |
| 4 workers @ c=32 | 1293.62 | 0.78 | 0.74 | 0.92 | 1.51 | 0.85 |

