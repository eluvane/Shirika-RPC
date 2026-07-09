# Shirika-RPC quality configuration

This directory is the canonical home for repository quality tooling. Root files should stay limited to project manifests that tools genuinely need at the workspace root (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig.json`, `.gitignore`, `.editorconfig`, and documentation). Old standalone quality configs should not be reintroduced in the repository root.

## Layout

```text
.config/shirika/
  build/          Rollup and build-tool configuration
  ci/             GitHub Actions helper config: actionlint, CodeQL, dependency review
  formatters/     Biome, Prettier, Taplo, and ignore policy
  lints/          ESLint, dependency graph, Markdown/YAML/package/name/unused-code lints
  quality/        lint orchestration manifest and repository policy metadata
  security/       audit-ci, cspell, gitleaks, license, lockfile, OSV and zizmor policy
  test/           Vitest projects and test-runner shims
  typescript/     TypeScript project references and compiler profiles
```

## Canonical tool map

| Area                  | Local command                                               | Canonical config                                                                                                 |
| --------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Prettier              | `pnpm run format`, `pnpm run format:check`                  | `.config/shirika/formatters/prettier.json`, `.config/shirika/formatters/prettierignore`                          |
| Biome                 | `pnpm run lint:biome`                                       | `.config/shirika/formatters/biome.jsonc`                                                                         |
| Taplo/TOML            | `pnpm run lint:toml`                                        | `.config/shirika/formatters/taplo.toml`                                                                          |
| ESLint                | `pnpm run lint:eslint`                                      | `.config/shirika/lints/eslint.config.mjs`                                                                        |
| Oxlint                | `pnpm run lint:oxlint`                                      | `.config/shirika/lints/oxlint.json`                                                                              |
| dependency-cruiser    | `pnpm run lint:depcruise`                                   | `.config/shirika/lints/dependency-cruiser.cjs`                                                                   |
| Markdown              | `pnpm run lint:markdown`, `pnpm run lint:markdown:external` | `.config/shirika/lints/markdownlint-cli2.jsonc`                                                                  |
| YAML                  | `pnpm run lint:yaml:external`                               | `.config/shirika/lints/yamllint.yml`                                                                             |
| GitHub Actions        | `pnpm run lint:actions:external`, `pnpm run lint:workflows` | `.config/shirika/ci/actionlint.yml`, `scripts/quality/run-actionlint.mjs`, `scripts/quality/check-workflows.mjs` |
| package.json hygiene  | `pnpm run lint:package`, `pnpm run lint:package-json-lint`  | `.config/shirika/lints/npm-package-json-lint.json`, `scripts/quality/check-package-policy.mjs`                   |
| naming conventions    | `pnpm run lint:ls`                                          | `.config/shirika/lints/ls-lint.yml`                                                                              |
| JSON validation       | `pnpm run lint:json`                                        | `scripts/quality/check-json.mjs`                                                                                 |
| Knip                  | `pnpm run check:deps`                                       | `.config/shirika/lints/knip.json`                                                                                |
| syncpack              | `pnpm run lint:syncpack`                                    | `.config/shirika/lints/syncpack.config.cjs`                                                                      |
| gitleaks              | `pnpm run security:gitleaks`                                | `.config/shirika/security/gitleaks.toml`                                                                         |
| OSV Scanner           | `pnpm run security:osv`                                     | `.config/shirika/security/osv-scanner.toml`                                                                      |
| audit-ci              | `pnpm run lint:audit-ci`                                    | `.config/shirika/security/audit-ci.jsonc`                                                                        |
| CodeQL                | `.github/workflows/codeql.yml`                              | `.config/shirika/ci/codeql-config.yml`                                                                           |
| Dependency Review     | `.github/workflows/ci.yml` dependency-review job            | `.config/shirika/ci/dependency-review-config.yml`                                                                |
| Lean formal layer     | `pnpm run formal:lean:check`                                | `formal/lean/lean-toolchain`, `formal/lean/lakefile.toml`, `scripts/quality/check-lean-policy.mjs`               |
| TypeScript dual stack | `pnpm run typecheck`, `pnpm run build:types`                | `@typescript/native` → native `tsc` (TS 7); `typescript` → `@typescript/typescript6` JS API (TS 6 until 7.1)     |

## TypeScript 7 dual stack

TypeScript 7 ships a native Go `tsc` but no programmatic compiler API yet (planned for 7.1). This repo follows the official side-by-side install:

| Package alias        | Resolves to                  | Role                                                                             |
| -------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `@typescript/native` | `typescript@^7`              | CLI binary `tsc` used by `typecheck` / `build:types`                             |
| `typescript`         | `@typescript/typescript6@^6` | JS API for `typescript-eslint`, `@rollup/plugin-typescript`, and peer resolution |

`scripts/quality/check-package-policy.mjs` enforces this dual stack. Do not point `typescript` at 7 alone until tools that import the compiler API support the 7.1 API.

## Local commands

Install the workspace from the repository root:

```bash
corepack enable
corepack prepare pnpm@11.8.0 --activate
pnpm install --ignore-scripts --strict-peer-dependencies
```

The main developer commands are:

```bash
pnpm run format
pnpm run lint
pnpm run lint:strict
pnpm run lint:paranoid
pnpm run security
pnpm run test
pnpm run build
pnpm run bench:smoke
pnpm run check
pnpm run check:ci
```

Some commands intentionally call ecosystem tools that are not bundled as project dependencies: `yamllint`, `actionlint`, `zizmor`, `gitleaks`, `osv-scanner`, and elan/Lake for the formal layer. CI installs those tools explicitly instead of relying on global machine state.

## Blocking and non-blocking policy

Required CI jobs are blocking by default. There are no `continue-on-error: true` quality jobs. Long-running benchmark and paranoid scans are scheduled or manually dispatched, but they are still real gates when invoked.

## Root shims and root files

The root `tsconfig.json` is a technical TypeScript project shim; canonical compiler profiles live under `.config/shirika/typescript`. The root `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml` are canonical project inputs, not lint configuration. Lean keeps its `lean-toolchain`, `lakefile.toml`, and `lake-manifest.json` inside `formal/lean` because elan/Lake discover those files from the Lean package root.
