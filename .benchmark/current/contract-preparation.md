# Contract preparation benchmark

Generated at: 2026-08-12T15:36:00.757Z
Node: v26.0.0
Methods: 64
Iterations: 100000

| Case | ops/sec | total ms |
| --- | --- | --- |
| describeContract(raw contract) | 32848.94 | 3044.24 |
| describeContract(prepared) | 135592.36 | 737.50 |
| getContractHash(raw contract) | 33693.08 | 2967.97 |
| getContractHash(prepared) | 162785.72 | 614.30 |
| buildMethodIndex(raw contract) | 32251.51 | 3100.63 |
| prepared.methodIndex lookup | 41898856.16 | 2.39 |

| Comparison | time reduction % | throughput improvement % |
| --- | --- | --- |
| describe prepared vs raw | 75.77 | 312.78 |
| hash prepared vs raw | 79.30 | 383.14 |
| prepared index lookup vs raw build | 99.92 | 129812.86 |
