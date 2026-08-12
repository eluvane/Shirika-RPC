# Contract preparation benchmark

Generated at: 2026-08-12T16:15:43.990Z
Node: v24.11.0
Methods: 64
Iterations: 100000

| Case | ops/sec | total ms |
| --- | --- | --- |
| describeContract(raw contract) | 30981.80 | 3227.70 |
| describeContract(prepared) | 133390.02 | 749.68 |
| getContractHash(raw contract) | 32128.82 | 3112.47 |
| getContractHash(prepared) | 153133.85 | 653.02 |
| buildMethodIndex(raw contract) | 30342.90 | 3295.66 |
| prepared.methodIndex lookup | 38844002.49 | 2.57 |

| Comparison | time reduction % | throughput improvement % |
| --- | --- | --- |
| describe prepared vs raw | 76.77 | 330.54 |
| hash prepared vs raw | 79.02 | 376.62 |
| prepared index lookup vs raw build | 99.92 | 127916.77 |
