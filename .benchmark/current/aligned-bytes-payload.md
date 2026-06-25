# aligned-bytes payload benchmark

Generated at: 2026-06-25T17:59:23.736Z
Node: v26.4.0

| Case | ops/sec | avg ms | p95 ms | payload bytes |
| --- | --- | --- | --- | --- |
| small/no-wrap | 46,220.55 | 0.02 | 0.03 | 32 |
| small/prefix-wrap | 45,354.25 | 0.02 | 0.03 | 32 |
| small/body-wrap | 50,425.72 | 0.02 | 0.02 | 32 |
| 1MiB/no-wrap | 5,120.12 | 0.2 | 0.22 | 1048576 |
| 1MiB/prefix-wrap | 3,795.01 | 0.26 | 0.28 | 1048576 |
| 1MiB/body-wrap | 3,621.04 | 0.28 | 0.31 | 1048576 |
| 8MiB/no-wrap | 569.68 | 1.76 | 3.16 | 8388608 |
| 8MiB/prefix-wrap | 388.87 | 2.57 | 3.08 | 8388608 |
| 8MiB/body-wrap | 497.91 | 2.01 | 2.18 | 8388608 |
| 32MiB/no-wrap | 149.35 | 6.7 | 8.44 | 33554432 |
| 32MiB/prefix-wrap | 120.49 | 8.3 | 9.22 | 33554432 |
| 32MiB/body-wrap | 104.36 | 9.58 | 10.5 | 33554432 |
