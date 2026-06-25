# Shirika-RPC benchmark governance

This directory is the canonical benchmark control plane for Shirika-RPC. It contains tracked policy and suite metadata; generated benchmark output is written under `.benchmark/current`, `.benchmark/smoke`, `.benchmark/previous`, and `.benchmark/comparison` and is ignored by Git.

## What belongs here

- `suites.json` lists supported benchmark suites and their local command names.
- `policy.json` defines the default regression thresholds used by `pnpm run bench:compare`.
- Generated `baseline.json`, `summary.md`, per-suite JSON and comparison reports belong in ignored subdirectories.

## Local commands

```bash
pnpm run bench:smoke
pnpm run bench:collect
pnpm run bench:compare
```

Smoke mode is the CI governance path. Full collection is intended for release-facing baseline refreshes and performance investigations.
