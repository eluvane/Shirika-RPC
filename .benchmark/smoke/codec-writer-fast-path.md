# Codec writer fast path benchmark

Generated at: 2026-06-25T18:00:11.276Z
Node: v26.4.0
Iterations: 3000

| Case | Strategy | ops/sec | avg ms | p95 ms | heap delta bytes |
| --- | --- | --- | --- | --- | --- |
| u32 direct safe writer | safe-writer | 1373374.84 | 0.00 | 0.00 | 779328 |
| u32 direct trusted measured writer | generic-trusted-measured-writer | 1944264.42 | 0.00 | 0.00 | 505488 |
| struct direct safe writer | safe-writer | 1689760.05 | 0.00 | 0.00 | 61176 |
| struct direct generic trusted writer | generic-trusted-measured-writer | 1897173.21 | 0.00 | 0.00 | 97376 |
| struct direct specialized writer | specialized:struct(tag:u8,count:u16,ok:bool) | 2122992.00 | 0.00 | 0.00 | 358512 |
| nested direct safe writer | safe-writer | 525090.58 | 0.00 | 0.00 | 738760 |
| nested direct generic trusted writer | generic-trusted-measured-writer | 541672.69 | 0.00 | 0.00 | 1595768 |
| nested direct specialized writer | specialized:struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8))) | 460073.31 | 0.00 | 0.00 | -547800 |
| frame struct safe fallback | safe-fallback | 49707.80 | 0.02 | 0.02 | 84832 |
| frame struct prepared specialized writer | specialized:struct(tag:u8,count:u16,ok:bool) | 24244.58 | 0.04 | 0.04 | -92600 |
| frame nested safe fallback | safe-fallback | 42076.15 | 0.02 | 0.03 | -469984 |
| frame nested prepared specialized writer | specialized:struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8))) | 27199.24 | 0.04 | 0.04 | -103768 |

| Comparison | latency reduction % | throughput improvement % |
| --- | --- | --- |
| u32 direct trusted measured vs safe | 29.36 | 41.57 |
| struct direct generic trusted vs safe | 10.93 | 12.27 |
| struct direct specialized vs safe | 20.41 | 25.64 |
| struct direct specialized vs generic trusted | 10.64 | 11.90 |
| nested direct generic trusted vs safe | 3.06 | 3.16 |
| nested direct specialized vs safe | -14.13 | -12.38 |
| nested direct specialized vs generic trusted | -17.74 | -15.06 |
| frame struct prepared specialized vs safe | -105.03 | -51.23 |
| frame nested prepared specialized vs safe | -54.70 | -35.36 |
