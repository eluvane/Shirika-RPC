# aligned-bytes payload benchmark

Generated at: 2026-08-12T16:16:38.354Z
Node: v24.11.0

| Case | ops/sec | avg ms | p95 ms | payload bytes |
| --- | --- | --- | --- | --- |
| small/no-wrap | 10,997.07 | 0.09 | 0.16 | 32 |
| small/prefix-wrap | 17,688.68 | 0.06 | 0.06 | 32 |
| small/body-wrap | 14,388.49 | 0.07 | 0.12 | 32 |
| 1MiB/no-wrap | 4,340.28 | 0.23 | 0.26 | 1048576 |
| 1MiB/prefix-wrap | 3,323 | 0.3 | 0.32 | 1048576 |
| 1MiB/body-wrap | 3,419.19 | 0.29 | 0.31 | 1048576 |
