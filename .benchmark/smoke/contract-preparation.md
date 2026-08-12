# Contract preparation benchmark

Generated at: 2026-08-12T15:36:51.888Z
Node: v26.0.0
Methods: 64
Iterations: 5000

| Case | ops/sec | total ms |
| --- | --- | --- |
| describeContract(raw contract) | 32485.74 | 153.91 |
| describeContract(prepared) | 134889.42 | 37.07 |
| getContractHash(raw contract) | 32757.89 | 152.63 |
| getContractHash(prepared) | 152718.85 | 32.74 |
| buildMethodIndex(raw contract) | 32047.34 | 156.02 |
| prepared.methodIndex lookup | 43029259.90 | 0.12 |

| Comparison | time reduction % | throughput improvement % |
| --- | --- | --- |
| describe prepared vs raw | 75.92 | 315.23 |
| hash prepared vs raw | 78.55 | 366.20 |
| prepared index lookup vs raw build | 99.93 | 134167.81 |
