# Benchmark comparison

Current baseline: 2026-08-12T15:36:45.162Z
Previous baseline: 2026-06-25T17:59:53.639Z
Thresholds: throughput -5%, avg/p95 +5%, p99 +8%

Detected 22 benchmark governance regression(s).

## contract-preparation

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| describeContract(raw contract) | 31578.88 | 32848.94 | +4.02% | n/a | n/a | n/a | ok |
| describeContract(prepared) | 142165.39 | 135592.36 | -4.62% | n/a | n/a | n/a | ok |
| getContractHash(raw contract) | 32930.15 | 33693.08 | +2.32% | n/a | n/a | n/a | ok |
| getContractHash(prepared) | 164661.61 | 162785.72 | -1.14% | n/a | n/a | n/a | ok |
| buildMethodIndex(raw contract) | 29541.52 | 32251.51 | +9.17% | n/a | n/a | n/a | ok |
| prepared.methodIndex lookup | 42780748.66 | 41898856.16 | -2.06% | n/a | n/a | n/a | ok |

## frame-receive

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| empty request frame receive/read | 43953.80 | 44650.49 | +1.59% | -1.56% | -1.56% | -1.56% | ok |
| small request frame receive/read | 45060.78 | 44801.03 | -0.58% | +0.58% | +0.58% | +0.58% | ok |
| mixed request/response/cancel receive/read | 45694.94 | 46070.08 | +0.82% | -0.81% | -0.81% | -0.81% | ok |

## aligned-bytes-payload

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| small/no-wrap | 46220.55 | 44461.44 | -3.81% | +3.96% | +23.08% | +23.08% | p95 latency +23.08%; p99 latency +23.08% |
| small/prefix-wrap | 45354.25 | 47016.01 | +3.66% | -3.53% | -17.19% | -17.19% | ok |
| small/body-wrap | 50425.72 | 45218.18 | -10.33% | +11.52% | +76.44% | +76.44% | throughput -10.33%; avg latency +11.52%; p95 latency +76.44%; p99 latency +76.44% |
| 1MiB/no-wrap | 5120.12 | 5371.61 | +4.91% | -4.68% | +4.74% | +4.74% | ok |
| 1MiB/prefix-wrap | 3795.01 | 3771.99 | -0.61% | +0.61% | +6.35% | +6.35% | p95 latency +6.35% |
| 1MiB/body-wrap | 3621.04 | 3791.10 | +4.70% | -4.49% | +0.33% | +0.33% | ok |
| 8MiB/no-wrap | 569.68 | 612.47 | +7.51% | -6.99% | +2.96% | +2.96% | ok |
| 8MiB/prefix-wrap | 388.87 | 422.87 | +8.74% | -8.04% | +8.31% | +8.31% | p95 latency +8.31%; p99 latency +8.31% |
| 8MiB/body-wrap | 497.91 | 486.89 | -2.21% | +2.26% | +44.42% | +44.42% | p95 latency +44.42%; p99 latency +44.42% |
| 32MiB/no-wrap | 149.35 | 167.20 | +11.95% | -10.67% | -20.29% | -20.29% | ok |
| 32MiB/prefix-wrap | 120.49 | 122.10 | +1.34% | -1.32% | -7.55% | -7.55% | ok |
| 32MiB/body-wrap | 104.36 | 132.68 | +27.13% | -21.34% | -22.45% | -22.45% | ok |

## codec-writer-fast-path

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe writer | 2943756.59 | 3003291.61 | +2.02% | n/a | n/a | n/a | ok |
| u32 direct trusted measured writer | 3069235.82 | 2877764.09 | -6.24% | n/a | n/a | n/a | throughput -6.24% |
| struct direct safe writer | 2521381.31 | 2591250.90 | +2.77% | n/a | n/a | n/a | ok |
| struct direct generic trusted writer | 2532261.01 | 2426795.71 | -4.16% | n/a | n/a | n/a | ok |
| struct direct specialized writer | 2925892.98 | 2698720.27 | -7.76% | n/a | n/a | n/a | throughput -7.76% |
| nested direct safe writer | 686818.85 | 681035.61 | -0.84% | n/a | n/a | n/a | ok |
| nested direct generic trusted writer | 706434.20 | 701515.13 | -0.70% | n/a | n/a | n/a | ok |
| nested direct specialized writer | 1028349.54 | 933103.91 | -9.26% | n/a | n/a | n/a | throughput -9.26% |
| frame struct safe fallback | 58772.79 | 61361.47 | +4.40% | n/a | n/a | n/a | ok |
| frame struct prepared specialized writer | 27479.97 | 28316.86 | +3.05% | n/a | n/a | n/a | ok |
| frame nested safe fallback | 40980.97 | 50802.67 | +23.97% | n/a | n/a | n/a | ok |
| frame nested prepared specialized writer | 28082.32 | 31596.01 | +12.51% | n/a | n/a | n/a | ok |

## codec-read-fast-path

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| u32 direct safe reader | 2972793.00 | 3168507.57 | +6.58% | n/a | n/a | n/a | ok |
| u32 direct validated read-side | 129878.87 | 149381.20 | +15.02% | n/a | n/a | n/a | ok |
| tuple(bool,u16) direct safe reader | 2813263.98 | 2953991.58 | +5.00% | n/a | n/a | n/a | ok |
| tuple(bool,u16) direct validated read-side | 129248.85 | 148739.38 | +15.08% | n/a | n/a | n/a | ok |
| struct direct safe reader | 2787782.82 | 2809036.11 | +0.76% | n/a | n/a | n/a | ok |
| struct direct validated read-side | 128202.50 | 150405.00 | +17.32% | n/a | n/a | n/a | ok |
| frame struct safe reader fallback | 50568.77 | 69626.90 | +37.69% | n/a | n/a | n/a | ok |
| frame struct validated read-side | 40314.73 | 48783.74 | +21.01% | n/a | n/a | n/a | ok |

## pending-lifecycle

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| single request release raw map | 28650208.46 | 27981389.02 | -2.33% | +2.39% | +0.23% | +7.49% | ok |
| single request release witness | 22619439.69 | 21696699.24 | -4.08% | +4.25% | +0.31% | +0.43% | ok |
| late stale witness release raw map | 15575314.75 | 15277643.67 | -1.91% | +1.95% | +7.92% | +2.98% | p95 latency +7.92% |
| late stale witness release witness | 12954213.59 | 13155035.25 | +1.55% | -1.53% | -3.48% | -4.05% | ok |
| close many pending raw map | 14151725.75 | 14996640.75 | +5.97% | -5.63% | -3.41% | -13.97% | ok |
| close many pending witness | 8585182.52 | 8512666.85 | -0.84% | +0.85% | +9.31% | +13.46% | p95 latency +9.31%; p99 latency +13.46% |

## node-postmessage-vs-sab

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| postMessage 32B | 54033.97 | 56603.94 | +4.76% | -3.00% | -3.07% | +21.75% | p99 latency +21.75% |
| sab-binary 32B | 12980.69 | 12727.25 | -1.95% | -0.93% | -5.16% | -1.46% | ok |
| sab-msgpack 32B | 15888.46 | 15887.06 | -0.01% | +0.31% | +3.49% | +6.86% | ok |
| postMessage 4KiB | 49675.13 | 51261.75 | +3.19% | -3.53% | -10.53% | -13.65% | ok |
| sab-binary 4KiB | 12526.31 | 10390.20 | -17.05% | +32.47% | +63.53% | +69.08% | throughput -17.05%; avg latency +32.47%; p95 latency +63.53%; p99 latency +69.08% |
| sab-msgpack 4KiB | 14812.54 | 12343.19 | -16.67% | +39.54% | +75.88% | +63.57% | throughput -16.67%; avg latency +39.54%; p95 latency +75.88%; p99 latency +63.57% |
| postMessage 64KiB | 21139.12 | 19754.50 | -6.55% | +0.84% | -0.69% | +19.42% | throughput -6.55%; p99 latency +19.42% |
| sab-binary 64KiB | 8865.06 | 9398.19 | +6.01% | +3.28% | +5.44% | +6.29% | p95 latency +5.44% |
| sab-msgpack 64KiB | 11098.37 | 10004.73 | -9.85% | +16.42% | +17.72% | +24.84% | throughput -9.85%; avg latency +16.42%; p95 latency +17.72%; p99 latency +24.84% |

## node-pool-contention

| Case | prev ops/sec | curr ops/sec | Δ ops | Δ avg | Δ p95 | Δ p99 | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 workers @ c=1 | 16853.59 | 16228.32 | -3.71% | +8.09% | +24.10% | +43.91% | avg latency +8.09%; p95 latency +24.10%; p99 latency +43.91% |
| 1 workers @ c=8 | 4372.03 | 4267.94 | -2.38% | +4.58% | +15.41% | +9.33% | p95 latency +15.41%; p99 latency +9.33% |
| 1 workers @ c=32 | 1244.94 | 1263.46 | +1.49% | -1.03% | +4.57% | -2.70% | ok |
| 2 workers @ c=1 | 16410.66 | 16736.03 | +1.98% | -4.19% | -12.34% | -6.70% | ok |
| 2 workers @ c=8 | 4629.99 | 4600.26 | -0.64% | -3.49% | -12.77% | -7.41% | ok |
| 2 workers @ c=32 | 1368.80 | 1336.07 | -2.39% | +1.36% | +5.86% | -0.32% | p95 latency +5.86% |
| 4 workers @ c=1 | 16279.36 | 14459.93 | -11.18% | +16.11% | +42.79% | +28.94% | throughput -11.18%; avg latency +16.11%; p95 latency +42.79%; p99 latency +28.94% |
| 4 workers @ c=8 | 4164.61 | 4281.40 | +2.80% | +14.49% | +50.28% | +26.80% | avg latency +14.49%; p95 latency +50.28%; p99 latency +26.80% |
| 4 workers @ c=32 | 1169.37 | 1238.23 | +5.89% | -3.30% | +17.77% | -2.18% | p95 latency +17.77% |

