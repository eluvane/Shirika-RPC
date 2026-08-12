# Codec read fast path benchmark

Generated at: 2026-08-12T15:36:54.406Z
Node: v26.0.0
Iterations: 3000

| Case | Strategy | ops/sec | avg ms | p95 ms | heap delta bytes |
| --- | --- | --- | --- | --- | --- |
| u32 direct safe reader | safe-ring-binary-reader | 1466634.07 | 0.00 | 0.00 | 730728 |
| u32 direct validated read-side | read-side:u32 | 128774.16 | 0.01 | 0.01 | 1264984 |
| tuple(bool,u16) direct safe reader | safe-ring-binary-reader | 1583113.46 | 0.00 | 0.00 | -1239080 |
| tuple(bool,u16) direct validated read-side | read-side:tuple(bool,u16) | 132111.45 | 0.01 | 0.01 | 28240 |
| struct direct safe reader | safe-ring-binary-reader | 1714187.76 | 0.00 | 0.00 | -1834592 |
| struct direct validated read-side | read-side:struct(tag:u8,count:u16,ok:bool) | 134549.06 | 0.01 | 0.01 | 1209016 |
| frame struct safe reader fallback | safe-reader-fallback | 65086.23 | 0.02 | 0.02 | 346624 |
| frame struct validated read-side | read-side:struct(tag:u8,count:u16,ok:bool) | 46441.86 | 0.02 | 0.02 | -781600 |

| Comparison | latency reduction % | throughput improvement % |
| --- | --- | --- |
| u32 direct validated read-side vs safe | -1038.92 | -91.22 |
| tuple direct validated read-side vs safe | -1098.32 | -91.65 |
| struct direct validated read-side vs safe | -1174.02 | -92.15 |
| frame struct validated read-side vs safe | -40.15 | -28.65 |
