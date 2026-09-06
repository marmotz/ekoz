# AGENTS.md — `packages/sdk` (`@ekozhq/sdk`)

The JavaScript/TypeScript SDK for the Ekoz protocol. **The only integration
surface** for every Ekoz client (`apps/client-web`, `apps/admin`, third parties)
— clients never call `fetch` directly.

Backlog: [`backlog/`](../../backlog/) (SDK tasks under `sdk-foundations`). Protocol contract:
[`docs/protocol/`](../../docs/protocol/). Packaging policy:
[SDK packaging and protocol-version policy](../../docs/technical/sdk-packaging-and-protocol-policy.md).

## Stack

- Pure TypeScript, no runtime deps. Dual ESM + CJS build via **tsdown**
  (`bun run build` → `dist/`). Tests: **Vitest** (`src/**/*.test.ts`, mocked
  `fetch`).
- `composite: true` — part of the root `tsc -b` solution.
- Formatting + lint: repo-wide **Biome** (`biome.json` at the root). No local config.

## Conventions

- Everything in **English**.
- This is the one published package. Add a **changeset** (`bunx changeset` from
  the repo root) whenever `src/` changes; keep `CHANGELOG.md` driven by
  Changesets, not hand-edited.
- Wire types track a specific protocol version; a mismatch with
  `docs/protocol/` is fixed in `docs/`, not worked around here.
- Every design decision or notable change → a page under `docs/technical/`.

## Definition of Done

Tests created / updated and green; `bun run typecheck` + `bun run lint` green; a
changeset added; README resource list updated when a resource is added.
