# Benchmark baseline

Generated at: 2026-06-25T18:00:24.007Z
Mode: smoke
Node: v26.4.0
Platform: win32/x64

## contract-preparation

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| describeContract(raw contract) | 32357.91 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| describeContract(prepared) | 138916.67 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| getContractHash(raw contract) | 30231.04 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| getContractHash(prepared) | 154602.99 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| buildMethodIndex(raw contract) | 31122.26 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| prepared.methodIndex lookup | 22552999.55 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## frame-receive

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| empty request frame receive/read | 38013.13 | 0.03 | 0.03 | 0.03 | 0.03 | 0.00 |
| small request frame receive/read | 41532.90 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |
| mixed request/response/cancel receive/read | 44294.63 | 0.02 | 0.02 | 0.02 | 0.02 | 0.00 |

## aligned-bytes-payload

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| small/no-wrap | 17311.02 | 0.06 | 0.06 | 0.06 | 0.06 | 0.00 |
| small/prefix-wrap | 20847.81 | 0.05 | 0.05 | 0.06 | 0.06 | 0.00 |
| small/body-wrap | 18529.96 | 0.05 | 0.05 | 0.08 | 0.08 | 0.00 |
| 1MiB/no-wrap | 4797.70 | 0.21 | 0.21 | 0.23 | 0.23 | 0.00 |
| 1MiB/prefix-wrap | 3362.85 | 0.30 | 0.30 | 0.32 | 0.32 | 0.00 |
| 1MiB/body-wrap | 3115.91 | 0.32 | 0.32 | 0.35 | 0.35 | 0.00 |

## codec-writer-fast-path

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe writer | 1373374.84 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| u32 direct trusted measured writer | 1944264.42 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct safe writer | 1689760.05 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct generic trusted writer | 1897173.21 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct specialized writer | 2122992.00 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct safe writer | 525090.58 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct generic trusted writer | 541672.69 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| nested direct specialized writer | 460073.31 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct safe fallback | 49707.80 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct prepared specialized writer | 24244.58 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame nested safe fallback | 42076.15 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame nested prepared specialized writer | 27199.24 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## codec-read-fast-path

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe reader | 1543845.20 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| u32 direct validated read-side | 131020.39 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| tuple(bool,u16) direct safe reader | 1595914.46 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| tuple(bool,u16) direct validated read-side | 129495.66 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct safe reader | 1638269.99 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| struct direct validated read-side | 134683.76 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct safe reader fallback | 65673.39 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| frame struct validated read-side | 45930.34 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## pending-lifecycle

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| single request release raw map | 28123066.54 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| single request release witness | 15374208.23 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| late stale witness release raw map | 13810247.20 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| late stale witness release witness | 9321401.94 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| close many pending raw map | 10730534.81 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |
| close many pending witness | 5836008.17 | 0.00 | 0.00 | 0.00 | 0.00 | 0.00 |

## node-postmessage-vs-sab

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 32B | 52735.19 | 0.02 | 0.02 | 0.03 | 0.05 | 0.18 |
| sab-binary 32B | 12106.76 | 0.08 | 0.08 | 0.12 | 0.16 | 0.34 |
| sab-msgpack 32B | 15745.28 | 0.07 | 0.06 | 0.11 | 0.16 | 0.37 |
| postMessage 64KiB | 18722.00 | 0.07 | 0.06 | 0.11 | 0.23 | 0.77 |
| sab-binary 64KiB | 9724.25 | 0.12 | 0.10 | 0.20 | 0.31 | 0.52 |
| sab-msgpack 64KiB | 11372.59 | 0.10 | 0.08 | 0.16 | 0.25 | 0.51 |

## node-pool-contention

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| 1 workers @ c=1 | 15752.28 | 0.07 | 0.06 | 0.13 | 0.21 | 0.46 |
| 1 workers @ c=8 | 4255.46 | 0.25 | 0.23 | 0.37 | 0.53 | 0.58 |
| 1 workers @ c=32 | 1231.54 | 0.82 | 0.79 | 0.97 | 1.36 | 0.71 |
| 2 workers @ c=1 | 16209.03 | 0.06 | 0.06 | 0.10 | 0.15 | 0.38 |
| 2 workers @ c=8 | 4271.00 | 0.24 | 0.22 | 0.40 | 0.52 | 0.93 |
| 2 workers @ c=32 | 1289.47 | 0.81 | 0.72 | 1.28 | 1.64 | 1.34 |
| 4 workers @ c=1 | 16130.23 | 0.07 | 0.06 | 0.14 | 0.18 | 0.50 |
| 4 workers @ c=8 | 3930.65 | 0.29 | 0.25 | 0.49 | 0.64 | 1.14 |
| 4 workers @ c=32 | 1024.33 | 1.07 | 0.91 | 1.88 | 2.34 | 2.49 |
