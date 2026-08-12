# Codec read fast path benchmark

Generated at: 2026-08-12T16:16:38.903Z
Node: v24.11.0
Iterations: 3000

| Case | Strategy | ops/sec | avg ms | p95 ms | heap delta bytes |
| --- | --- | --- | --- | --- | --- |
| u32 direct safe reader | safe-ring-binary-reader | 1201297.40 | 0.00 | 0.00 | -610224 |
| u32 direct validated read-side | read-side:u32 | 116977.76 | 0.01 | 0.01 | -825400 |
| tuple(bool,u16) direct safe reader | safe-ring-binary-reader | 1375894.33 | 0.00 | 0.00 | -854056 |
| tuple(bool,u16) direct validated read-side | read-side:tuple(bool,u16) | 127153.67 | 0.01 | 0.01 | -491480 |
| struct direct safe reader | safe-ring-binary-reader | 1371553.97 | 0.00 | 0.00 | 589992 |
| struct direct validated read-side | read-side:struct(tag:u8,count:u16,ok:bool) | 130847.81 | 0.01 | 0.01 | 1564776 |
| frame struct safe reader fallback | safe-reader-fallback | 59145.58 | 0.02 | 0.02 | -1718448 |
| frame struct validated read-side | read-side:struct(tag:u8,count:u16,ok:bool) | 44856.59 | 0.02 | 0.02 | 1280712 |

| Comparison | latency reduction % | throughput improvement % |
| --- | --- | --- |
| u32 direct validated read-side vs safe | -926.95 | -90.26 |
| tuple direct validated read-side vs safe | -982.07 | -90.76 |
| struct direct validated read-side vs safe | -948.21 | -90.46 |
| frame struct validated read-side vs safe | -31.85 | -24.16 |
