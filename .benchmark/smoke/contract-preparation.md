# Contract preparation benchmark

Generated at: 2026-06-25T18:00:09.259Z
Node: v26.4.0
Methods: 64
Iterations: 5000

| Case | ops/sec | total ms |
| --- | --- | --- |
| describeContract(raw contract) | 32357.91 | 154.52 |
| describeContract(prepared) | 138916.67 | 35.99 |
| getContractHash(raw contract) | 30231.04 | 165.39 |
| getContractHash(prepared) | 154602.99 | 32.34 |
| buildMethodIndex(raw contract) | 31122.26 | 160.66 |
| prepared.methodIndex lookup | 22552999.55 | 0.22 |

| Comparison | time reduction % | throughput improvement % |
| --- | --- | --- |
| describe prepared vs raw | 76.71 | 329.31 |
| hash prepared vs raw | 80.45 | 411.40 |
| prepared index lookup vs raw build | 99.86 | 72365.81 |
