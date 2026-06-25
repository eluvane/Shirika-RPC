# Codec read fast path benchmark

Generated at: 2026-06-25T17:59:30.479Z
Node: v26.4.0
Iterations: 100000

| Case | Strategy | ops/sec | avg ms | p95 ms | heap delta bytes |
| --- | --- | --- | --- | --- | --- |
| u32 direct safe reader | safe-ring-binary-reader | 2972793.00 | 0.00 | 0.00 | 88864 |
| u32 direct validated read-side | read-side:u32 | 129878.87 | 0.01 | 0.01 | 785584 |
| tuple(bool,u16) direct safe reader | safe-ring-binary-reader | 2813263.98 | 0.00 | 0.00 | 1105640 |
| tuple(bool,u16) direct validated read-side | read-side:tuple(bool,u16) | 129248.85 | 0.01 | 0.01 | -60344 |
| struct direct safe reader | safe-ring-binary-reader | 2787782.82 | 0.00 | 0.00 | 664568 |
| struct direct validated read-side | read-side:struct(tag:u8,count:u16,ok:bool) | 128202.50 | 0.01 | 0.01 | 1440712 |
| frame struct safe reader fallback | safe-reader-fallback | 50568.77 | 0.02 | 0.03 | 831608 |
| frame struct validated read-side | read-side:struct(tag:u8,count:u16,ok:bool) | 40314.73 | 0.02 | 0.03 | -892136 |

| Comparison | latency reduction % | throughput improvement % |
| --- | --- | --- |
| u32 direct validated read-side vs safe | -2188.90 | -95.63 |
| tuple direct validated read-side vs safe | -2076.63 | -95.41 |
| struct direct validated read-side vs safe | -2074.52 | -95.40 |
| frame struct validated read-side vs safe | -25.43 | -20.28 |
