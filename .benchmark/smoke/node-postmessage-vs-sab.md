# node-postmessage-vs-sab

## Payload 32B

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 32B | 56178.66 | 0.02 | 0.02 | 0.02 | 0.05 | 0.20 |
| sab-binary 32B | 12611.13 | 0.08 | 0.08 | 0.12 | 0.19 | 0.34 |
| sab-msgpack 32B | 15708.51 | 0.07 | 0.06 | 0.10 | 0.15 | 0.38 |

## Payload 64KiB

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 64KiB | 23474.64 | 0.06 | 0.05 | 0.09 | 0.15 | 0.63 |
| sab-binary 64KiB | 10090.48 | 0.11 | 0.09 | 0.16 | 0.24 | 0.39 |
| sab-msgpack 64KiB | 11340.22 | 0.10 | 0.08 | 0.18 | 0.25 | 0.68 |

