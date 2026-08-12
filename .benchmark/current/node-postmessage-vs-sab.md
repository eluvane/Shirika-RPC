# node-postmessage-vs-sab

## Payload 32B

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 32B | 56603.94 | 0.02 | 0.02 | 0.02 | 0.05 | 0.20 |
| sab-binary 32B | 12727.25 | 0.08 | 0.07 | 0.12 | 0.17 | 0.31 |
| sab-msgpack 32B | 15887.06 | 0.07 | 0.06 | 0.10 | 0.16 | 0.37 |

## Payload 4KiB

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 4KiB | 51261.75 | 0.02 | 0.02 | 0.03 | 0.07 | 0.27 |
| sab-binary 4KiB | 10390.20 | 0.11 | 0.09 | 0.19 | 0.27 | 0.58 |
| sab-msgpack 4KiB | 12343.19 | 0.10 | 0.07 | 0.19 | 0.25 | 0.76 |

## Payload 64KiB

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 64KiB | 19754.50 | 0.07 | 0.06 | 0.12 | 0.22 | 0.96 |
| sab-binary 64KiB | 9398.19 | 0.12 | 0.10 | 0.21 | 0.29 | 0.59 |
| sab-msgpack 64KiB | 10004.73 | 0.12 | 0.10 | 0.22 | 0.32 | 0.89 |

