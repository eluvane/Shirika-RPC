# Codec writer fast path benchmark

Generated at: 2026-08-12T15:36:53.893Z
Node: v26.0.0
Iterations: 3000

| Case | Strategy | ops/sec | avg ms | p95 ms | heap delta bytes |
| --- | --- | --- | --- | --- | --- |
| u32 direct safe writer | safe-writer | 1445365.20 | 0.00 | 0.00 | 762856 |
| u32 direct trusted measured writer | generic-trusted-measured-writer | 1799640.07 | 0.00 | 0.00 | 501552 |
| struct direct safe writer | safe-writer | 1347527.29 | 0.00 | 0.00 | 92816 |
| struct direct generic trusted writer | generic-trusted-measured-writer | 1783803.07 | 0.00 | 0.00 | 130120 |
| struct direct specialized writer | specialized:struct(tag:u8,count:u16,ok:bool) | 2101428.97 | 0.00 | 0.00 | 330584 |
| nested direct safe writer | safe-writer | 487005.08 | 0.00 | 0.00 | 897816 |
| nested direct generic trusted writer | generic-trusted-measured-writer | 491199.35 | 0.00 | 0.00 | 973112 |
| nested direct specialized writer | specialized:struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8))) | 457024.47 | 0.00 | 0.00 | -258976 |
| frame struct safe fallback | safe-fallback | 48791.99 | 0.02 | 0.02 | -404384 |
| frame struct prepared specialized writer | specialized:struct(tag:u8,count:u16,ok:bool) | 23524.82 | 0.04 | 0.04 | -430856 |
| frame nested safe fallback | safe-fallback | 42908.20 | 0.02 | 0.03 | 1275352 |
| frame nested prepared specialized writer | specialized:struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8))) | 26999.64 | 0.04 | 0.04 | -523976 |

| Comparison | latency reduction % | throughput improvement % |
| --- | --- | --- |
| u32 direct trusted measured vs safe | 19.69 | 24.51 |
| struct direct generic trusted vs safe | 24.46 | 32.38 |
| struct direct specialized vs safe | 35.88 | 55.95 |
| struct direct specialized vs generic trusted | 15.11 | 17.81 |
| nested direct generic trusted vs safe | 0.85 | 0.86 |
| nested direct specialized vs safe | -6.56 | -6.16 |
| nested direct specialized vs generic trusted | -7.48 | -6.96 |
| frame struct prepared specialized vs safe | -107.41 | -51.79 |
| frame nested prepared specialized vs safe | -58.92 | -37.08 |
