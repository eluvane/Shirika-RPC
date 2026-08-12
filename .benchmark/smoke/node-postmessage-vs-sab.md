# node-postmessage-vs-sab

## Payload 32B

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 32B | 52835.91 | 0.02 | 0.02 | 0.03 | 0.04 | 0.19 |
| sab-binary 32B | 11397.20 | 0.09 | 0.08 | 0.14 | 0.21 | 0.51 |
| sab-msgpack 32B | 15138.18 | 0.07 | 0.06 | 0.11 | 0.17 | 0.44 |

## Payload 64KiB

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 64KiB | 23388.71 | 0.06 | 0.06 | 0.10 | 0.23 | 0.70 |
| sab-binary 64KiB | 9702.45 | 0.12 | 0.10 | 0.17 | 0.25 | 0.38 |
| sab-msgpack 64KiB | 10262.98 | 0.10 | 0.09 | 0.16 | 0.22 | 0.64 |

