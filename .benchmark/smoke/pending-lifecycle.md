# pending lifecycle benchmark

Generated at: 2026-08-12T15:36:54.657Z
Node: v26.0.0

| Case | ops/sec | avg ms/op | p95 ms/op | p99 ms/op |
| --- | --- | --- | --- | --- |
| single request release raw map | 26037598.29 | 0.000038 | 0.000047 | 0.000047 |
| single request release witness | 16831616.51 | 0.000059 | 0.000069 | 0.000069 |
| late stale witness release raw map | 14026032.32 | 0.000071 | 0.000079 | 0.000079 |
| late stale witness release witness | 9540710.21 | 0.000105 | 0.000116 | 0.000116 |
| close many pending raw map | 13121981.94 | 0.000076 | 0.000119 | 0.000119 |
| close many pending witness | 5730133.63 | 0.000175 | 0.000258 | 0.000258 |
