# pending lifecycle benchmark

Generated at: 2026-06-25T18:00:12.046Z
Node: v26.4.0

| Case | ops/sec | avg ms/op | p95 ms/op | p99 ms/op |
| --- | --- | --- | --- | --- |
| single request release raw map | 28123066.54 | 0.000036 | 0.000042 | 0.000042 |
| single request release witness | 15374208.23 | 0.000065 | 0.000083 | 0.000083 |
| late stale witness release raw map | 13810247.20 | 0.000072 | 0.000078 | 0.000078 |
| late stale witness release witness | 9321401.94 | 0.000107 | 0.000118 | 0.000118 |
| close many pending raw map | 10730534.81 | 0.000093 | 0.000142 | 0.000142 |
| close many pending witness | 5836008.17 | 0.000171 | 0.000232 | 0.000232 |
