# pending lifecycle benchmark

Generated at: 2026-08-12T16:16:39.166Z
Node: v24.11.0

| Case | ops/sec | avg ms/op | p95 ms/op | p99 ms/op |
| --- | --- | --- | --- | --- |
| single request release raw map | 26886056.89 | 0.000037 | 0.000043 | 0.000043 |
| single request release witness | 16944557.41 | 0.000059 | 0.000071 | 0.000071 |
| late stale witness release raw map | 13922147.35 | 0.000072 | 0.000077 | 0.000077 |
| late stale witness release witness | 9971481.56 | 0.000100 | 0.000124 | 0.000124 |
| close many pending raw map | 11001100.11 | 0.000091 | 0.000127 | 0.000127 |
| close many pending witness | 6763245.82 | 0.000148 | 0.000198 | 0.000198 |
