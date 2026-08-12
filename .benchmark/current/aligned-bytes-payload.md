# aligned-bytes payload benchmark

Generated at: 2026-08-12T15:36:17.251Z
Node: v26.0.0

| Case | ops/sec | avg ms | p95 ms | payload bytes |
| --- | --- | --- | --- | --- |
| small/no-wrap | 44,461.44 | 0.02 | 0.03 | 32 |
| small/prefix-wrap | 47,016.01 | 0.02 | 0.02 | 32 |
| small/body-wrap | 45,218.18 | 0.02 | 0.04 | 32 |
| 1MiB/no-wrap | 5,371.61 | 0.19 | 0.23 | 1048576 |
| 1MiB/prefix-wrap | 3,771.99 | 0.27 | 0.3 | 1048576 |
| 1MiB/body-wrap | 3,791.1 | 0.26 | 0.31 | 1048576 |
| 8MiB/no-wrap | 612.47 | 1.63 | 3.26 | 8388608 |
| 8MiB/prefix-wrap | 422.87 | 2.36 | 3.33 | 8388608 |
| 8MiB/body-wrap | 486.89 | 2.05 | 3.15 | 8388608 |
| 32MiB/no-wrap | 167.2 | 5.98 | 6.73 | 33554432 |
| 32MiB/prefix-wrap | 122.1 | 8.19 | 8.53 | 33554432 |
| 32MiB/body-wrap | 132.68 | 7.54 | 8.15 | 33554432 |
