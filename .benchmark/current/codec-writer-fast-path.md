# Codec writer fast path benchmark

Generated at: 2026-08-12T15:36:17.317Z
Node: v26.0.0
Iterations: 50000

| Case | Strategy | ops/sec | avg ms | p95 ms | heap delta bytes |
| --- | --- | --- | --- | --- | --- |
| u32 direct safe writer | safe-writer | 3003291.61 | 0.00 | 0.00 | -402968 |
| u32 direct trusted measured writer | generic-trusted-measured-writer | 2877764.09 | 0.00 | 0.00 | -1102200 |
| struct direct safe writer | safe-writer | 2591250.90 | 0.00 | 0.00 | 178584 |
| struct direct generic trusted writer | generic-trusted-measured-writer | 2426795.71 | 0.00 | 0.00 | -561480 |
| struct direct specialized writer | specialized:struct(tag:u8,count:u16,ok:bool) | 2698720.27 | 0.00 | 0.00 | 1062680 |
| nested direct safe writer | safe-writer | 681035.61 | 0.00 | 0.00 | -121328 |
| nested direct generic trusted writer | generic-trusted-measured-writer | 701515.13 | 0.00 | 0.00 | -32768 |
| nested direct specialized writer | specialized:struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8))) | 933103.91 | 0.00 | 0.00 | 1913472 |
| frame struct safe fallback | safe-fallback | 61361.47 | 0.02 | 0.02 | -601024 |
| frame struct prepared specialized writer | specialized:struct(tag:u8,count:u16,ok:bool) | 28316.86 | 0.04 | 0.04 | -134784 |
| frame nested safe fallback | safe-fallback | 50802.67 | 0.02 | 0.02 | 355960 |
| frame nested prepared specialized writer | specialized:struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8))) | 31596.01 | 0.03 | 0.03 | 2925776 |

| Comparison | latency reduction % | throughput improvement % |
| --- | --- | --- |
| u32 direct trusted measured vs safe | -4.36 | -4.18 |
| struct direct generic trusted vs safe | -6.78 | -6.35 |
| struct direct specialized vs safe | 3.98 | 4.15 |
| struct direct specialized vs generic trusted | 10.08 | 11.21 |
| nested direct generic trusted vs safe | 2.92 | 3.01 |
| nested direct specialized vs safe | 27.01 | 37.01 |
| nested direct specialized vs generic trusted | 24.82 | 33.01 |
| frame struct prepared specialized vs safe | -116.70 | -53.85 |
| frame nested prepared specialized vs safe | -60.79 | -37.81 |
