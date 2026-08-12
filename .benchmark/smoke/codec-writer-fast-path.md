# Codec writer fast path benchmark

Generated at: 2026-08-12T16:16:38.420Z
Node: v24.11.0
Iterations: 3000

| Case | Strategy | ops/sec | avg ms | p95 ms | heap delta bytes |
| --- | --- | --- | --- | --- | --- |
| u32 direct safe writer | safe-writer | 1289102.78 | 0.00 | 0.00 | 1027328 |
| u32 direct trusted measured writer | generic-trusted-measured-writer | 1510802.24 | 0.00 | 0.00 | -1111968 |
| struct direct safe writer | safe-writer | 1399645.42 | 0.00 | 0.00 | 187008 |
| struct direct generic trusted writer | generic-trusted-measured-writer | 1200816.56 | 0.00 | 0.00 | -1595888 |
| struct direct specialized writer | specialized:struct(tag:u8,count:u16,ok:bool) | 1665833.75 | 0.00 | 0.00 | 315736 |
| nested direct safe writer | safe-writer | 504464.51 | 0.00 | 0.00 | -17176 |
| nested direct generic trusted writer | generic-trusted-measured-writer | 516564.50 | 0.00 | 0.00 | 133008 |
| nested direct specialized writer | specialized:struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8))) | 440709.84 | 0.00 | 0.00 | -790304 |
| frame struct safe fallback | safe-fallback | 53643.85 | 0.02 | 0.02 | 527912 |
| frame struct prepared specialized writer | specialized:struct(tag:u8,count:u16,ok:bool) | 26398.11 | 0.04 | 0.04 | 119960 |
| frame nested safe fallback | safe-fallback | 46470.42 | 0.02 | 0.02 | 127040 |
| frame nested prepared specialized writer | specialized:struct(tag:u8,maybePayload:optional(bytes),pairs:array(tuple(bool,u8))) | 29757.18 | 0.03 | 0.03 | -187352 |

| Comparison | latency reduction % | throughput improvement % |
| --- | --- | --- |
| u32 direct trusted measured vs safe | 14.67 | 17.20 |
| struct direct generic trusted vs safe | -16.56 | -14.21 |
| struct direct specialized vs safe | 15.98 | 19.02 |
| struct direct specialized vs generic trusted | 27.91 | 38.73 |
| nested direct generic trusted vs safe | 2.34 | 2.40 |
| nested direct specialized vs safe | -14.47 | -12.64 |
| nested direct specialized vs generic trusted | -17.21 | -14.68 |
| frame struct prepared specialized vs safe | -103.21 | -50.79 |
| frame nested prepared specialized vs safe | -56.17 | -35.97 |
