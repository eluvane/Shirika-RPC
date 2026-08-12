# Codec read fast path benchmark

Generated at: 2026-08-12T16:16:07.478Z
Node: v24.11.0
Iterations: 100000

| Case | Strategy | ops/sec | avg ms | p95 ms | heap delta bytes |
| --- | --- | --- | --- | --- | --- |
| u32 direct safe reader | safe-ring-binary-reader | 2944779.49 | 0.00 | 0.00 | 1479976 |
| u32 direct validated read-side | read-side:u32 | 148079.40 | 0.01 | 0.01 | 140360 |
| tuple(bool,u16) direct safe reader | safe-ring-binary-reader | 2970523.50 | 0.00 | 0.00 | 103552 |
| tuple(bool,u16) direct validated read-side | read-side:tuple(bool,u16) | 142443.32 | 0.01 | 0.01 | -165400 |
| struct direct safe reader | safe-ring-binary-reader | 2830223.39 | 0.00 | 0.00 | -437496 |
| struct direct validated read-side | read-side:struct(tag:u8,count:u16,ok:bool) | 146467.98 | 0.01 | 0.01 | 54232 |
| frame struct safe reader fallback | safe-reader-fallback | 67742.06 | 0.01 | 0.02 | -1355872 |
| frame struct validated read-side | read-side:struct(tag:u8,count:u16,ok:bool) | 46903.15 | 0.02 | 0.02 | 501872 |

| Comparison | latency reduction % | throughput improvement % |
| --- | --- | --- |
| u32 direct validated read-side vs safe | -1888.65 | -94.97 |
| tuple direct validated read-side vs safe | -1985.41 | -95.20 |
| struct direct validated read-side vs safe | -1832.32 | -94.82 |
| frame struct validated read-side vs safe | -44.43 | -30.76 |
