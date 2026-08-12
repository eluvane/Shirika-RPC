# Benchmark baseline

Generated at: 2026-08-12T15:37:06.573Z
Mode: smoke
Node: v26.0.0
Platform: win32/x64

## contract-preparation

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| describeContract(raw contract) | 32485.74 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| describeContract(prepared) | 134889.42 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| getContractHash(raw contract) | 32757.89 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| getContractHash(prepared) | 152718.85 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| buildMethodIndex(raw contract) | 32047.34 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| prepared.methodIndex lookup | 43029259.90 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## frame-receive

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| empty request frame receive/read | 37307.31 | 0.03 | 0.03 | 0.03 | 0.03 | 0.00 |
| small request frame receive/read | 40263.65 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |
| mixed request/response/cancel receive/read | 43763.10 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |

## aligned-bytes-payload

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| small/no-wrap | 17761.99 | 0.06 | 0.06 | 0.06 | 0.06 | 0.00 |
| small/prefix-wrap | 20435.97 | 0.05 | 0.05 | 0.05 | 0.05 | 0.00 |
| small/body-wrap | 16268.98 | 0.06 | 0.06 | 0.10 | 0.10 | 0.00 |
| 1MiB/no-wrap | 5118.58 | 0.20 | 0.20 | 0.21 | 0.21 | 0.00 |
| 1MiB/prefix-wrap | 3344.48 | 0.30 | 0.30 | 0.31 | 0.31 | 0.00 |
| 1MiB/body-wrap | 3382.95 | 0.30 | 0.30 | 0.35 | 0.35 | 0.00 |

## codec-writer-fast-path

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe writer | 1445365.20 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| u32 direct trusted measured writer | 1799640.07 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct safe writer | 1347527.29 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct generic trusted writer | 1783803.07 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct specialized writer | 2101428.97 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct safe writer | 487005.08 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct generic trusted writer | 491199.35 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct specialized writer | 457024.47 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct safe fallback | 48791.99 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct prepared specialized writer | 23524.82 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame nested safe fallback | 42908.20 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame nested prepared specialized writer | 26999.64 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## codec-read-fast-path

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe reader | 1466634.07 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| u32 direct validated read-side | 128774.16 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| tuple(bool,u16) direct safe reader | 1583113.46 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| tuple(bool,u16) direct validated read-side | 132111.45 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct safe reader | 1714187.76 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct validated read-side | 134549.06 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct safe reader fallback | 65086.23 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct validated read-side | 46441.86 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## pending-lifecycle

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| single request release raw map | 26037598.29 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| single request release witness | 16831616.51 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| late stale witness release raw map | 14026032.32 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| late stale witness release witness | 9540710.21 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| close many pending raw map | 13121981.94 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| close many pending witness | 5730133.63 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## node-postmessage-vs-sab

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 32B | 56178.66 | 0.02 | 0.02 | 0.02 | 0.05 | 0.20 |
| sab-binary 32B | 12611.13 | 0.08 | 0.08 | 0.12 | 0.19 | 0.34 |
| sab-msgpack 32B | 15708.51 | 0.07 | 0.06 | 0.10 | 0.15 | 0.38 |
| postMessage 64KiB | 23474.64 | 0.06 | 0.05 | 0.09 | 0.15 | 0.63 |
| sab-binary 64KiB | 10090.48 | 0.11 | 0.09 | 0.16 | 0.24 | 0.39 |
| sab-msgpack 64KiB | 11340.22 | 0.10 | 0.08 | 0.18 | 0.25 | 0.68 |

## node-pool-contention

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 workers @ c=1 | 16339.34 | 0.07 | 0.06 | 0.11 | 0.18 | 0.35 |
| 1 workers @ c=8 | 4197.76 | 0.25 | 0.23 | 0.37 | 0.54 | 0.65 |
| 1 workers @ c=32 | 1266.71 | 0.80 | 0.76 | 0.96 | 1.38 | 0.77 |
| 2 workers @ c=1 | 16927.92 | 0.06 | 0.06 | 0.09 | 0.14 | 0.28 |
| 2 workers @ c=8 | 4675.77 | 0.22 | 0.21 | 0.31 | 0.42 | 0.45 |
| 2 workers @ c=32 | 1305.89 | 0.78 | 0.72 | 1.03 | 1.40 | 0.96 |
| 4 workers @ c=1 | 16895.97 | 0.06 | 0.06 | 0.10 | 0.15 | 0.33 |
| 4 workers @ c=8 | 4613.31 | 0.23 | 0.21 | 0.37 | 0.51 | 0.46 |
| 4 workers @ c=32 | 1321.39 | 0.77 | 0.73 | 0.97 | 1.43 | 0.79 |

