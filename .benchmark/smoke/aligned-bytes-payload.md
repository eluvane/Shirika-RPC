# aligned-bytes payload benchmark

Generated at: 2026-06-25T18:00:11.216Z
Node: v26.4.0

| Case | ops/sec | avg ms | p95 ms | payload bytes |
| --- | --- | --- | --- | --- |
| small/no-wrap | 17,311.02 | 0.06 | 0.06 | 32 |
| small/prefix-wrap | 20,847.81 | 0.05 | 0.06 | 32 |
| small/body-wrap | 18,529.96 | 0.05 | 0.08 | 32 |
| 1MiB/no-wrap | 4,797.7 | 0.21 | 0.23 | 1048576 |
| 1MiB/prefix-wrap | 3,362.85 | 0.3 | 0.32 | 1048576 |
| 1MiB/body-wrap | 3,115.91 | 0.32 | 0.35 | 1048576 |
