<p align="center">
  <img
    width="100%"
    src="https://capsule-render.vercel.app/api?type=waving&amp;height=220&amp;color=0:0B1220,50:1E1B4B,100:4F46E5&amp;text=Shirika-RPC&amp;fontColor=E2E8F0&amp;fontSize=54&amp;fontAlignY=50"
    alt="Header banner"
  />
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-1E293B?style=for-the-badge" />
  <img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-1E293B?style=for-the-badge" />
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-1E293B?style=for-the-badge" />
  <img alt="Web Workers" src="https://img.shields.io/badge/Web%20Workers-1E293B?style=for-the-badge" />
  <img alt="Lean 4" src="https://img.shields.io/badge/Lean%204-1E293B?style=for-the-badge" />
  <img alt="pnpm" src="https://img.shields.io/badge/pnpm-1E293B?style=for-the-badge" />
</p>

TypeScript ESM library for typed RPC between a host thread and Web Workers or Node.js `worker_threads`.

It uses SharedArrayBuffer and Atomics for the hot path, with regular worker messages for bootstrap, cancellation, errors, and lifecycle control.

> Status: **experimental / pre-public package**. The public API is intentionally small, but the package is not yet versioned as a stable production contract.

## Quick start

```bash
npm install shirika-rpc
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
