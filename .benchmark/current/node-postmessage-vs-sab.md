# node-postmessage-vs-sab

## Payload 32B

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 32B | 54033.97 | 0.02 | 0.02 | 0.02 | 0.04 | 0.16 |
| sab-binary 32B | 12980.69 | 0.08 | 0.07 | 0.12 | 0.18 | 0.31 |
| sab-msgpack 32B | 15888.46 | 0.07 | 0.06 | 0.10 | 0.15 | 0.36 |

## Payload 4KiB

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 4KiB | 49675.13 | 0.02 | 0.02 | 0.04 | 0.08 | 0.25 |
| sab-binary 4KiB | 12526.31 | 0.08 | 0.08 | 0.12 | 0.16 | 0.34 |
| sab-msgpack 4KiB | 14812.54 | 0.07 | 0.06 | 0.11 | 0.15 | 0.42 |

## Payload 64KiB

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 64KiB | 21139.12 | 0.07 | 0.06 | 0.12 | 0.18 | 0.91 |
| sab-binary 64KiB | 8865.06 | 0.12 | 0.10 | 0.20 | 0.27 | 0.73 |
| sab-msgpack 64KiB | 11098.37 | 0.10 | 0.08 | 0.19 | 0.26 | 0.57 |
