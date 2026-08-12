# pending lifecycle benchmark

Generated at: 2026-08-12T16:16:13.917Z
Node: v24.11.0

| Case | ops/sec | avg ms/op | p95 ms/op | p99 ms/op |
| --- | --- | --- | --- | --- |
| single request release raw map | 29058549.49 | 0.000034 | 0.000039 | 0.000039 |
| single request release witness | 22499151.78 | 0.000044 | 0.000049 | 0.000049 |
| late stale witness release raw map | 16096620.93 | 0.000062 | 0.000064 | 0.000064 |
| late stale witness release witness | 13376630.81 | 0.000075 | 0.000086 | 0.000099 |
| close many pending raw map | 13079733.01 | 0.000076 | 0.000112 | 0.000152 |
| close many pending witness | 8193296.25 | 0.000122 | 0.000197 | 0.000238 |
