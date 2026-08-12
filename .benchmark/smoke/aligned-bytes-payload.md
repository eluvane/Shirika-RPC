# aligned-bytes payload benchmark

Generated at: 2026-08-12T15:36:53.829Z
Node: v26.0.0

| Case | ops/sec | avg ms | p95 ms | payload bytes |
| --- | --- | --- | --- | --- |
| small/no-wrap | 17,761.99 | 0.06 | 0.06 | 32 |
| small/prefix-wrap | 20,435.97 | 0.05 | 0.05 | 32 |
| small/body-wrap | 16,268.98 | 0.06 | 0.1 | 32 |
| 1MiB/no-wrap | 5,118.58 | 0.2 | 0.21 | 1048576 |
| 1MiB/prefix-wrap | 3,344.48 | 0.3 | 0.31 | 1048576 |
| 1MiB/body-wrap | 3,382.95 | 0.3 | 0.35 | 1048576 |
