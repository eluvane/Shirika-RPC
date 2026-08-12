# node-postmessage-vs-sab

## Payload 32B

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 32B | 55869.24 | 0.02 | 0.02 | 0.02 | 0.05 | 0.13 |
| sab-binary 32B | 11422.93 | 0.09 | 0.08 | 0.14 | 0.20 | 0.47 |
| sab-msgpack 32B | 15608.51 | 0.07 | 0.06 | 0.10 | 0.16 | 0.35 |

## Payload 4KiB

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 4KiB | 51195.37 | 0.02 | 0.02 | 0.03 | 0.06 | 0.22 |
| sab-binary 4KiB | 10882.02 | 0.10 | 0.08 | 0.18 | 0.22 | 0.66 |
| sab-msgpack 4KiB | 13809.26 | 0.08 | 0.06 | 0.14 | 0.17 | 0.61 |

## Payload 64KiB

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 64KiB | 20754.98 | 0.07 | 0.06 | 0.12 | 0.27 | 0.86 |
| sab-binary 64KiB | 8733.66 | 0.14 | 0.11 | 0.27 | 0.40 | 0.74 |
| sab-msgpack 64KiB | 10394.65 | 0.12 | 0.09 | 0.22 | 0.33 | 0.72 |

