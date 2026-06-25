# Codec read fast path benchmark

Generated at: 2026-06-25T18:00:11.791Z
Node: v26.4.0
Iterations: 3000

| Case | Strategy | ops/sec | avg ms | p95 ms | heap delta bytes |
| --- | --- | --- | --- | --- | --- |
| u32 direct safe reader | safe-ring-binary-reader | 1543845.20 | 0.00 | 0.00 | 769016 |
| u32 direct validated read-side | read-side:u32 | 131020.39 | 0.01 | 0.01 | 1161456 |
| tuple(bool,u16) direct safe reader | safe-ring-binary-reader | 1595914.46 | 0.00 | 0.00 | -1202248 |
| tuple(bool,u16) direct validated read-side | read-side:tuple(bool,u16) | 129495.66 | 0.01 | 0.01 | -236784 |
| struct direct safe reader | safe-ring-binary-reader | 1638269.99 | 0.00 | 0.00 | 226976 |
| struct direct validated read-side | read-side:struct(tag:u8,count:u16,ok:bool) | 134683.76 | 0.01 | 0.01 | 1041344 |
| frame struct safe reader fallback | safe-reader-fallback | 65673.39 | 0.02 | 0.02 | 248448 |
| frame struct validated read-side | read-side:struct(tag:u8,count:u16,ok:bool) | 45930.34 | 0.02 | 0.02 | -896424 |

| Comparison | latency reduction % | throughput improvement % |
| --- | --- | --- |
| u32 direct validated read-side vs safe | -1078.32 | -91.51 |
| tuple direct validated read-side vs safe | -1132.41 | -91.89 |
| struct direct validated read-side vs safe | -1116.38 | -91.78 |
| frame struct validated read-side vs safe | -42.98 | -30.06 |
