# AGENTS.md — Ekoz monorepo

Ekoz is an open chat protocol with a reference server, an SDK, a demonstration
web client and an admin console. This repository is the single source of truth
for all of them (Bun workspaces).

## Layout

| Path                | Package              | Publishes | What it is                                            |
| ------------------- | -------------------- | --------- | ---------------------------------------------------- |
| `packages/sdk`      | `@ekozhq/sdk`        | npm       | JS/TS SDK for the Ekoz protocol. Every client uses it. |
| `apps/server`       | `@ekozhq/server`     | no        | Reference server (NestJS 12, Prisma 8, Bun, Postgres). |
| `apps/client-web`   | `@ekozhq/client-web` | no        | Demonstration web client (React, Vite, Tailwind 4).   |
| `apps/admin`        | `@ekozhq/admin`      | no        | Admin console, deployed with the server, its own origin. |
| `docs/`             | —                    | —         | Specification: functional, protocol, technical + ADRs. |
| `backlog/`          | —                    | —         | Product/technical backlog, namespaced per area.       |

## Conventions

- **Everything in English**: directories, files, identifiers, comments. UI text
  goes through i18n catalogues (French + English).
- **Every design decision or notable change → an ADR** in
  `docs/technical/adr/` (see ADR 0015). Reference by number; do not duplicate.
- **Network access from clients goes exclusively through `@ekozhq/sdk`** — never
  a direct `fetch`.
- `CHANGELOG.md` per publishable package, managed by Changesets. Add a changeset
  (`bunx changeset`) whenever `packages/*/src` changes.
- Tests are part of every change (create / update / delete). Nothing is "done"
  until its tests are written and green.

## Commands (from the repo root)

| Command                   | Effect                                                     |
| ------------------------- | --------------------------------------------------------- |
| `bun install`             | Install every workspace.                                   |
| `bun run build`           | Build `@ekozhq/sdk` (what other workspaces consume).       |
| `bun run typecheck`       | `tsc --noEmit` in every workspace.                         |
| `bun run lint`            | Biome (format + lint) over the whole repo.                 |
| `bun run lint:boundaries` | ESLint boundaries rule for `apps/server` only.             |
| `bun run test`            | Vitest for `packages/*` and the web apps.                  |
| `bun run test:server`     | `apps/server` unit + integration (needs Docker).           |
| `bun run format`          | Biome autofix.                                             |

Per-workspace commands: `bun run --filter '@ekozhq/<name>' <script>`.

## Tooling

- **Biome** is the formatter + linter for the whole repo (single `biome.json`).
- `apps/server` additionally keeps a minimal ESLint config for the
  `eslint-plugin-boundaries` architecture rule (feature modules must not import
  each other directly).
- **lefthook** runs Biome + typecheck on pre-commit.
- **Changesets** drives versioning and npm publication (`scripts/release-publish.sh`).
