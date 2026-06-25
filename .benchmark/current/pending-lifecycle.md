# pending lifecycle benchmark

Generated at: 2026-06-25T17:59:38.094Z
Node: v26.4.0

| Case | ops/sec | avg ms/op | p95 ms/op | p99 ms/op |
| --- | --- | --- | --- | --- |
| single request release raw map | 28650208.46 | 0.000035 | 0.000038 | 0.000039 |
| single request release witness | 22619439.69 | 0.000044 | 0.000048 | 0.000051 |
| late stale witness release raw map | 15575314.75 | 0.000064 | 0.000067 | 0.000071 |
| late stale witness release witness | 12954213.59 | 0.000077 | 0.000080 | 0.000081 |
| close many pending raw map | 14151725.75 | 0.000071 | 0.000095 | 0.000150 |
| close many pending witness | 8585182.52 | 0.000116 | 0.000155 | 0.000171 |
