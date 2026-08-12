# aligned-bytes payload benchmark

Generated at: 2026-08-12T16:16:01.214Z
Node: v24.11.0

| Case | ops/sec | avg ms | p95 ms | payload bytes |
| --- | --- | --- | --- | --- |
| small/no-wrap | 42,655.47 | 0.02 | 0.03 | 32 |
| small/prefix-wrap | 43,404.66 | 0.02 | 0.03 | 32 |
| small/body-wrap | 44,138.91 | 0.02 | 0.03 | 32 |
| 1MiB/no-wrap | 3,568.78 | 0.28 | 0.8 | 1048576 |
| 1MiB/prefix-wrap | 3,871.77 | 0.26 | 0.28 | 1048576 |
| 1MiB/body-wrap | 3,757.25 | 0.27 | 0.3 | 1048576 |
| 8MiB/no-wrap | 557.48 | 1.79 | 3.06 | 8388608 |
| 8MiB/prefix-wrap | 482.61 | 2.07 | 2.59 | 8388608 |
| 8MiB/body-wrap | 498.54 | 2.01 | 2.36 | 8388608 |
| 32MiB/no-wrap | 175.45 | 5.7 | 6.32 | 33554432 |
| 32MiB/prefix-wrap | 131.62 | 7.6 | 7.94 | 33554432 |
| 32MiB/body-wrap | 121.99 | 8.2 | 8.82 | 33554432 |
