# AGENTS.md — `server` repository

Reference Ekoz server. The global specification, protocol and architecture
decisions live in the sibling `spec` repository
([github.com/ekoz-chat/spec](https://github.com/ekoz-chat/spec), on disk at
`../spec`) — read them before any implementation, in particular
`../spec/docs/technical/adr/`.

This repo's **backlog is in [`backlog/`](backlog/)** (per-feature `overview.md`,
`technical.md`, `tasks/`). Run the `backlog-*` skills and `implement-issue` from
this repository; GitHub issues are in `ekoz-chat/server`. Task/design docs
referenced by an issue are in `backlog/` here. See `backlog/AGENTS.md`.

## Stack

- **Bun** runtime (execution + package management). Types aligned with **Node
  26.8.1**.
- **NestJS 12** (ESM), **PostgreSQL** (exclusive).
- **Prisma 8**: start directly on the `8.0.0-rc` line (final release imminent).
  `prisma-client` generator, `@prisma/adapter-pg` driver adapter, connection
  through `prisma.config.ts` (no `url` in the schema). Load `.env` explicitly in
  `prisma.config.ts`.
- Tests: **Vitest**. Always target the latest versions.
- Distribution: Docker image.
- Stack POC done and conclusive: see
  [poc-nestjs12-prisma-bun.md](https://github.com/ekoz-chat/spec/blob/main/docs/technical/poc-nestjs12-prisma-bun.md).

## Conventions

- Everything in **English**: directories, files, classes, functions, variables,
  comments, API messages, documentation.
- Design documentation covers implementation only; anything cross-cutting goes to
  `spec`.
- Full-text search: raw Prisma SQL (`$queryRaw`) over PostgreSQL FTS functions.
- Feature-first architecture, cohesive NestJS modules, no hidden cross-module
  dependencies between domain modules.
- **Every design decision or notable change → an ADR in the `spec` repo**
  (`docs/technical/adr/`, see
  [ADR 0015](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0015-decisions-are-recorded-as-adrs.md)).
  This repo references ADRs by number/URL, it does not duplicate them.

## Definition of Done

- An ADR is written in `spec` if a decision was made or changed.
- Tests created / updated and **green**; typecheck green.
- `CHANGELOG.md`: an entry added under `## [Unreleased]` as soon as `src/`
  changes (a CI check enforces it). _Keep a Changelog_ format, SemVer. See
  **CHANGELOG entries** below.
- If the protocol behaviour changes: `../spec/docs/protocol/` and its
  `CHANGELOG.md` updated in the same effort (commit in the `spec` repo).
- Prisma migrations included where applicable.

## CHANGELOG entries

`CHANGELOG.md` records **what changed**, not why. One short bullet per
user-visible change, tagged with its issue (`(#42)`). No paragraphs, no version
pins (those live in `package.json`), no "notes on the approach".

Rationale, trade-offs, tooling surprises, "an ADR is owed" → the ADR itself and
the commit/PR body, never the changelog. The only caveats that belong in a
`### Notes` block are ones a _consumer_ must act on right now (e.g. a known bug
with a workaround).
