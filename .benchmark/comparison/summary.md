# Benchmark comparison

Current baseline: 2026-08-12T16:16:29.510Z
Previous baseline: 2026-08-12T15:36:45.162Z
Thresholds: throughput -5%, avg/p95 +5%, p99 +8%

Detected 25 benchmark governance regression(s).

## contract-preparation

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| describeContract(raw contract) | 32848.94 | 30981.80 | -5.68% | n/a | n/a | n/a | throughput -5.68% |
| describeContract(prepared) | 135592.36 | 133390.02 | -1.62% | n/a | n/a | n/a | ok |
| getContractHash(raw contract) | 33693.08 | 32128.82 | -4.64% | n/a | n/a | n/a | ok |
| getContractHash(prepared) | 162785.72 | 153133.85 | -5.93% | n/a | n/a | n/a | throughput -5.93% |
| buildMethodIndex(raw contract) | 32251.51 | 30342.90 | -5.92% | n/a | n/a | n/a | throughput -5.92% |
| prepared.methodIndex lookup | 41898856.16 | 38844002.49 | -7.29% | n/a | n/a | n/a | throughput -7.29% |

## frame-receive

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| empty request frame receive/read | 44650.49 | 42141.24 | -5.62% | +5.95% | +5.95% | +5.95% | throughput -5.62%; avg latency +5.95%; p95 latency +5.95% |
| small request frame receive/read | 44801.03 | 42601.91 | -4.91% | +5.16% | +5.16% | +5.16% | avg latency +5.16%; p95 latency +5.16% |
| mixed request/response/cancel receive/read | 46070.08 | 43423.22 | -5.75% | +6.10% | +6.10% | +6.10% | throughput -5.75%; avg latency +6.10%; p95 latency +6.10% |

## aligned-bytes-payload

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| small/no-wrap | 44461.44 | 42655.47 | -4.06% | +4.23% | -10.62% | -10.62% | ok |
| small/prefix-wrap | 47016.01 | 43404.66 | -7.68% | +8.32% | +31.78% | +31.78% | throughput -7.68%; avg latency +8.32%; p95 latency +31.78%; p99 latency +31.78% |
| small/body-wrap | 45218.18 | 44138.91 | -2.39% | +2.45% | -18.80% | -18.80% | ok |
| 1MiB/no-wrap | 5371.61 | 3568.78 | -33.56% | +50.52% | +246.91% | +246.91% | throughput -33.56%; avg latency +50.52%; p95 latency +246.91%; p99 latency +246.91% |
| 1MiB/prefix-wrap | 3771.99 | 3871.77 | +2.65% | -2.58% | -8.11% | -8.11% | ok |
| 1MiB/body-wrap | 3791.10 | 3757.25 | -0.89% | +0.90% | -3.16% | -3.16% | ok |
| 8MiB/no-wrap | 612.47 | 557.48 | -8.98% | +9.86% | -6.09% | -6.09% | throughput -8.98%; avg latency +9.86% |
| 8MiB/prefix-wrap | 422.87 | 482.61 | +14.13% | -12.38% | -22.39% | -22.39% | ok |
| 8MiB/body-wrap | 486.89 | 498.54 | +2.39% | -2.34% | -25.01% | -25.01% | ok |
| 32MiB/no-wrap | 167.20 | 175.45 | +4.94% | -4.71% | -6.08% | -6.08% | ok |
| 32MiB/prefix-wrap | 122.10 | 131.62 | +7.80% | -7.23% | -6.87% | -6.87% | ok |
| 32MiB/body-wrap | 132.68 | 121.99 | -8.05% | +8.76% | +8.21% | +8.21% | throughput -8.05%; avg latency +8.76%; p95 latency +8.21%; p99 latency +8.21% |

## codec-writer-fast-path

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe writer | 3003291.61 | 2534276.08 | -15.62% | n/a | n/a | n/a | throughput -15.62% |
| u32 direct trusted measured writer | 2877764.09 | 2549706.53 | -11.40% | n/a | n/a | n/a | throughput -11.40% |
| struct direct safe writer | 2591250.90 | 2434345.70 | -6.06% | n/a | n/a | n/a | throughput -6.06% |
| struct direct generic trusted writer | 2426795.71 | 2445382.38 | +0.77% | n/a | n/a | n/a | ok |
| struct direct specialized writer | 2698720.27 | 2642706.13 | -2.08% | n/a | n/a | n/a | ok |
| nested direct safe writer | 681035.61 | 727339.38 | +6.80% | n/a | n/a | n/a | ok |
| nested direct generic trusted writer | 701515.13 | 721146.91 | +2.80% | n/a | n/a | n/a | ok |
| nested direct specialized writer | 933103.91 | 950912.02 | +1.91% | n/a | n/a | n/a | ok |
| frame struct safe fallback | 61361.47 | 60012.82 | -2.20% | n/a | n/a | n/a | ok |
| frame struct prepared specialized writer | 28316.86 | 27656.06 | -2.33% | n/a | n/a | n/a | ok |
| frame nested safe fallback | 50802.67 | 51272.87 | +0.93% | n/a | n/a | n/a | ok |
| frame nested prepared specialized writer | 31596.01 | 30611.27 | -3.12% | n/a | n/a | n/a | ok |

## codec-read-fast-path

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe reader | 3168507.57 | 2944779.49 | -7.06% | n/a | n/a | n/a | throughput -7.06% |
| u32 direct validated read-side | 149381.20 | 148079.40 | -0.87% | n/a | n/a | n/a | ok |
| tuple(bool,u16) direct safe reader | 2953991.58 | 2970523.50 | +0.56% | n/a | n/a | n/a | ok |
| tuple(bool,u16) direct validated read-side | 148739.38 | 142443.32 | -4.23% | n/a | n/a | n/a | ok |
| struct direct safe reader | 2809036.11 | 2830223.39 | +0.75% | n/a | n/a | n/a | ok |
| struct direct validated read-side | 150405.00 | 146467.98 | -2.62% | n/a | n/a | n/a | ok |
| frame struct safe reader fallback | 69626.90 | 67742.06 | -2.71% | n/a | n/a | n/a | ok |
| frame struct validated read-side | 48783.74 | 46903.15 | -3.85% | n/a | n/a | n/a | ok |

## pending-lifecycle

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| single request release raw map | 27981389.02 | 29058549.49 | +3.85% | -3.71% | +2.42% | -8.34% | ok |
| single request release witness | 21696699.24 | 22499151.78 | +3.70% | -3.57% | +1.77% | -4.92% | ok |
| late stale witness release raw map | 15277643.67 | 16096620.93 | +5.36% | -5.09% | -12.28% | -13.16% | ok |
| late stale witness release witness | 13155035.25 | 13376630.81 | +1.68% | -1.66% | +11.54% | +27.44% | p95 latency +11.54%; p99 latency +27.44% |
| close many pending raw map | 14996640.75 | 13079733.01 | -12.78% | +14.66% | +21.84% | +17.74% | throughput -12.78%; avg latency +14.66%; p95 latency +21.84%; p99 latency +17.74% |
| close many pending witness | 8512666.85 | 8193296.25 | -3.75% | +3.90% | +16.57% | +22.61% | p95 latency +16.57%; p99 latency +22.61% |

## node-postmessage-vs-sab

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| postMessage 32B | 56603.94 | 55869.24 | -1.30% | +0.56% | -0.90% | +1.53% | ok |
| sab-binary 32B | 12727.25 | 11422.93 | -10.25% | +11.37% | +19.45% | +15.89% | throughput -10.25%; avg latency +11.37%; p95 latency +19.45%; p99 latency +15.89% |
| sab-msgpack 32B | 15887.06 | 15608.51 | -1.75% | +1.49% | -0.48% | -1.73% | ok |
| postMessage 4KiB | 51261.75 | 51195.37 | -0.13% | -3.48% | -9.12% | -5.32% | ok |
| sab-binary 4KiB | 10390.20 | 10882.02 | +4.73% | -11.91% | -7.94% | -19.71% | ok |
| sab-msgpack 4KiB | 12343.19 | 13809.26 | +11.88% | -22.42% | -28.38% | -31.20% | ok |
| postMessage 64KiB | 19754.50 | 20754.98 | +5.06% | -2.80% | +8.15% | +23.14% | p95 latency +8.15%; p99 latency +23.14% |
| sab-binary 64KiB | 9398.19 | 8733.66 | -7.07% | +13.56% | +31.45% | +38.36% | throughput -7.07%; avg latency +13.56%; p95 latency +31.45%; p99 latency +38.36% |
| sab-msgpack 64KiB | 10004.73 | 10394.65 | +3.90% | -3.21% | -1.92% | +2.05% | ok |

## node-pool-contention

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 workers @ c=1 | 16228.32 | 15105.79 | -6.92% | +7.69% | +10.01% | +10.75% | throughput -6.92%; avg latency +7.69%; p95 latency +10.01%; p99 latency +10.75% |
| 1 workers @ c=8 | 4267.94 | 3975.00 | -6.86% | +6.26% | +13.59% | +15.19% | throughput -6.86%; avg latency +6.26%; p95 latency +13.59%; p99 latency +15.19% |
| 1 workers @ c=32 | 1263.46 | 1216.95 | -3.68% | +4.05% | -0.39% | +7.93% | ok |
| 2 workers @ c=1 | 16736.03 | 16483.06 | -1.51% | +2.67% | +1.75% | +0.89% | ok |
| 2 workers @ c=8 | 4600.26 | 4004.25 | -12.96% | +13.01% | +0.63% | +0.46% | throughput -12.96%; avg latency +13.01% |
| 2 workers @ c=32 | 1336.07 | 1110.92 | -16.85% | +19.69% | +13.41% | +24.79% | throughput -16.85%; avg latency +19.69%; p95 latency +13.41%; p99 latency +24.79% |
| 4 workers @ c=1 | 14459.93 | 16641.71 | +15.09% | -18.21% | -40.87% | -32.87% | ok |
| 4 workers @ c=8 | 4281.40 | 4480.61 | +4.65% | -17.74% | -36.84% | -19.64% | ok |
| 4 workers @ c=32 | 1238.23 | 1276.83 | +3.12% | -5.65% | -31.80% | -9.05% | ok |

