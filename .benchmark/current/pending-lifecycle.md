# pending lifecycle benchmark

Generated at: 2026-08-12T15:36:29.631Z
Node: v26.0.0

| Case | ops/sec | avg ms/op | p95 ms/op | p99 ms/op |
| --- | --- | --- | --- | --- |
| single request release raw map | 27981389.02 | 0.000036 | 0.000038 | 0.000042 |
| single request release witness | 21696699.24 | 0.000046 | 0.000048 | 0.000051 |
| late stale witness release raw map | 15277643.67 | 0.000065 | 0.000072 | 0.000073 |
| late stale witness release witness | 13155035.25 | 0.000076 | 0.000077 | 0.000078 |
| close many pending raw map | 14996640.75 | 0.000067 | 0.000092 | 0.000129 |
| close many pending witness | 8512666.85 | 0.000117 | 0.000169 | 0.000194 |
