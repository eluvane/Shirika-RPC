# node-postmessage-vs-sab

## Payload 32B

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 32B | 52735.19 | 0.02 | 0.02 | 0.03 | 0.05 | 0.18 |
| sab-binary 32B | 12106.76 | 0.08 | 0.08 | 0.12 | 0.16 | 0.34 |
| sab-msgpack 32B | 15745.28 | 0.07 | 0.06 | 0.11 | 0.16 | 0.37 |

## Payload 64KiB

| Case | ops/sec | avg ms | p50 ms | p95 ms | p99 ms | rme % |
| --- | --- | --- | --- | --- | --- | --- |
| postMessage 64KiB | 18722.00 | 0.07 | 0.06 | 0.11 | 0.23 | 0.77 |
| sab-binary 64KiB | 9724.25 | 0.12 | 0.10 | 0.20 | 0.31 | 0.52 |
| sab-msgpack 64KiB | 11372.59 | 0.10 | 0.08 | 0.16 | 0.25 | 0.51 |
