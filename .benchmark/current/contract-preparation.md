# Contract preparation benchmark

Generated at: 2026-06-25T17:59:06.615Z
Node: v26.4.0
Methods: 64
Iterations: 100000

| Case | ops/sec | total ms |
| --- | --- | --- |
| describeContract(raw contract) | 31578.88 | 3166.67 |
| describeContract(prepared) | 142165.39 | 703.41 |
| getContractHash(raw contract) | 32930.15 | 3036.73 |
| getContractHash(prepared) | 164661.61 | 607.31 |
| buildMethodIndex(raw contract) | 29541.52 | 3385.07 |
| prepared.methodIndex lookup | 42780748.66 | 2.34 |

| Comparison | time reduction % | throughput improvement % |
| --- | --- | --- |
| describe prepared vs raw | 77.79 | 350.19 |
| hash prepared vs raw | 80.00 | 400.03 |
| prepared index lookup vs raw build | 99.93 | 144715.64 |
