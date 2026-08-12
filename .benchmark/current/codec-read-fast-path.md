# Codec read fast path benchmark

Generated at: 2026-08-12T15:36:23.393Z
Node: v26.0.0
Iterations: 100000

| Case | Strategy | ops/sec | avg ms | p95 ms | heap delta bytes |
| --- | --- | --- | --- | --- | --- |
| u32 direct safe reader | safe-ring-binary-reader | 3168507.57 | 0.00 | 0.00 | 234592 |
| u32 direct validated read-side | read-side:u32 | 149381.20 | 0.01 | 0.01 | -1021776 |
| tuple(bool,u16) direct safe reader | safe-ring-binary-reader | 2953991.58 | 0.00 | 0.00 | -855456 |
| tuple(bool,u16) direct validated read-side | read-side:tuple(bool,u16) | 148739.38 | 0.01 | 0.01 | -1566016 |
| struct direct safe reader | safe-ring-binary-reader | 2809036.11 | 0.00 | 0.00 | 518080 |
| struct direct validated read-side | read-side:struct(tag:u8,count:u16,ok:bool) | 150405.00 | 0.01 | 0.01 | -288792 |
| frame struct safe reader fallback | safe-reader-fallback | 69626.90 | 0.01 | 0.01 | -1540536 |
| frame struct validated read-side | read-side:struct(tag:u8,count:u16,ok:bool) | 48783.74 | 0.02 | 0.02 | -275584 |

| Comparison | latency reduction % | throughput improvement % |
| --- | --- | --- |
| u32 direct validated read-side vs safe | -2021.09 | -95.29 |
| tuple direct validated read-side vs safe | -1886.02 | -94.96 |
| struct direct validated read-side vs safe | -1767.65 | -94.65 |
| frame struct validated read-side vs safe | -42.73 | -29.94 |
