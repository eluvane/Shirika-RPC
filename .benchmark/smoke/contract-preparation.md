# Contract preparation benchmark

Generated at: 2026-08-12T16:16:36.394Z
Node: v24.11.0
Methods: 64
Iterations: 5000

| Case | ops/sec | total ms |
| --- | --- | --- |
| describeContract(raw contract) | 31089.09 | 160.83 |
| describeContract(prepared) | 131812.74 | 37.93 |
| getContractHash(raw contract) | 33365.56 | 149.86 |
| getContractHash(prepared) | 151224.16 | 33.06 |
| buildMethodIndex(raw contract) | 30673.15 | 163.01 |
| prepared.methodIndex lookup | 19157088.12 | 0.26 |

| Comparison | time reduction % | throughput improvement % |
| --- | --- | --- |
| describe prepared vs raw | 76.41 | 323.98 |
| hash prepared vs raw | 77.94 | 353.23 |
| prepared index lookup vs raw build | 99.84 | 62355.56 |
