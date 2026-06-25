# Shirika-RPC

TypeScript ESM library for typed RPC between a host thread and Web Workers or Node.js `worker_threads`.

It uses SharedArrayBuffer and Atomics for the hot path, with regular worker messages for bootstrap, cancellation, errors, and lifecycle control.

> Status: **experimental / pre-public package**. The public API is intentionally small, but the package is not yet versioned as a stable production contract.

## Quick start

```bash
corepack enable
corepack prepare pnpm@11.8.0 --activate
pnpm install --ignore-scripts --strict-peer-dependencies
pnpm run build
pnpm run test:node
```

```ts
import { codecs, defineContract, method } from 'shirika-rpc';

export const contract = defineContract({
  ping: method(1, codecs.struct({ text: codecs.string() }), codecs.struct({ text: codecs.string() })),
});
```

## Limitations

- Requires environments that support the selected worker and SharedArrayBuffer paths.
- Node and browser entrypoints are separate on purpose; do not rely on private internal modules.
- The package is experimental and keeps a deliberately small public surface until the API is stabilized.
