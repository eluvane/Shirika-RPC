# Codec writer fast path benchmark

Generated at: 2026-06-25T17:59:23.829Z
Node: v26.4.0
Iterations: 50000

| Case | Strategy | ops/sec | avg ms | p95 ms | heap delta bytes |
| --- | --- | --- | --- | --- | --- |
| u32 direct safe writer | safe-writer | 2943756.59 | 0.00 | 0.00 | -423928 |
| u32 direct trusted measured writer | generic-trusted-measured-writer | 3069235.82 | 0.00 | 0.00 | 195664 |
| struct direct safe writer | safe-writer | 2521381.31 | 0.00 | 0.00 | 199504 |
| struct direct generic trusted writer | generic-trusted-measured-writer | 2532261.01 | 0.00 | 0.00 | -318456 |
| struct direct specialized writer | specialized:struct(tag:u8,count:u16,ok:bool) | 2925892.98 | 0.00 | 0.00 | 947008 |
| nested direct safe writer | safe-writer | 686818.85 | 0.00 | 0.00 | -107352 |
| nested direct generic trusted writer | generic-trusted-measured-writer | 706434.20 | 0.00 | 0.00 | -57624 |
| nested direct specialized writer | specialized:struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8))) | 1028349.54 | 0.00 | 0.00 | -20800 |
| frame struct safe fallback | safe-fallback | 58772.79 | 0.02 | 0.02 | -1454664 |
| frame struct prepared specialized writer | specialized:struct(tag:u8,count:u16,ok:bool) | 27479.97 | 0.04 | 0.04 | 1791664 |
| frame nested safe fallback | safe-fallback | 40980.97 | 0.02 | 0.04 | 1479560 |
| frame nested prepared specialized writer | specialized:struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8))) | 28082.32 | 0.04 | 0.05 | 4068792 |

| Comparison | latency reduction % | throughput improvement % |
| --- | --- | --- |
| u32 direct trusted measured vs safe | 4.09 | 4.26 |
| struct direct generic trusted vs safe | 0.43 | 0.43 |
| struct direct specialized vs safe | 13.83 | 16.04 |
| struct direct specialized vs generic trusted | 13.45 | 15.54 |
| nested direct generic trusted vs safe | 2.78 | 2.86 |
| nested direct specialized vs safe | 33.21 | 49.73 |
| nested direct specialized vs generic trusted | 31.30 | 45.57 |
| frame struct prepared specialized vs safe | -113.88 | -53.24 |
| frame nested prepared specialized vs safe | -45.93 | -31.47 |
