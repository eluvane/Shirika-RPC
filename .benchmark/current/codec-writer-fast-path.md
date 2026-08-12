# Codec writer fast path benchmark

Generated at: 2026-08-12T16:16:01.286Z
Node: v24.11.0
Iterations: 50000

| Case | Strategy | ops/sec | avg ms | p95 ms | heap delta bytes |
| --- | --- | --- | --- | --- | --- |
| u32 direct safe writer | safe-writer | 2534276.08 | 0.00 | 0.00 | 596816 |
| u32 direct trusted measured writer | generic-trusted-measured-writer | 2549706.53 | 0.00 | 0.00 | 1966872 |
| struct direct safe writer | safe-writer | 2434345.70 | 0.00 | 0.00 | -206496 |
| struct direct generic trusted writer | generic-trusted-measured-writer | 2445382.38 | 0.00 | 0.00 | -868120 |
| struct direct specialized writer | specialized:struct(tag:u8,count:u16,ok:bool) | 2642706.13 | 0.00 | 0.00 | -896800 |
| nested direct safe writer | safe-writer | 727339.38 | 0.00 | 0.00 | -330768 |
| nested direct generic trusted writer | generic-trusted-measured-writer | 721146.91 | 0.00 | 0.00 | -327248 |
| nested direct specialized writer | specialized:struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8))) | 950912.02 | 0.00 | 0.00 | -496016 |
| frame struct safe fallback | safe-fallback | 60012.82 | 0.02 | 0.02 | 604504 |
| frame struct prepared specialized writer | specialized:struct(tag:u8,count:u16,ok:bool) | 27656.06 | 0.04 | 0.04 | 2899664 |
| frame nested safe fallback | safe-fallback | 51272.87 | 0.02 | 0.02 | -2070960 |
| frame nested prepared specialized writer | specialized:struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8))) | 30611.27 | 0.03 | 0.03 | 1941672 |

| Comparison | latency reduction % | throughput improvement % |
| --- | --- | --- |
| u32 direct trusted measured vs safe | 0.61 | 0.61 |
| struct direct generic trusted vs safe | 0.45 | 0.45 |
| struct direct specialized vs safe | 7.88 | 8.56 |
| struct direct specialized vs generic trusted | 7.47 | 8.07 |
| nested direct generic trusted vs safe | -0.86 | -0.85 |
| nested direct specialized vs safe | 23.51 | 30.74 |
| nested direct specialized vs generic trusted | 24.16 | 31.86 |
| frame struct prepared specialized vs safe | -117.00 | -53.92 |
| frame nested prepared specialized vs safe | -67.50 | -40.30 |
