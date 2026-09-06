# AGENTS.md — `apps/server`

Reference Ekoz server. Global specification, protocol and architecture decisions
live in [`docs/`](../../docs/) at the repo root — read them before any
implementation, in particular [`docs/technical/`](../../docs/technical/).

Backlog: [`backlog/`](../../backlog/). Run the `backlog-*` skills and `implement-issue` from
the repo root.

## Stack

- **Bun** runtime (execution + package management). Types aligned with Node 26.
- **NestJS 12** (ESM), **PostgreSQL** (exclusive).
- **Prisma 8** (`8.0.0-rc` line): `@prisma/orm-postgres` driver adapter,
  connection through `prisma.config.ts` (no `url` in the contract). `.env` is
  loaded explicitly in `prisma.config.ts`.
- Tests: **Vitest** (`*.spec.ts` unit, `*.e2e-spec.ts` integration via
  Testcontainers).
- Distribution: Docker image (`Dockerfile`, built from the **repo root** as
  context — see the header in that file).

## Commands

From the repo root: `bun run --filter '@ekozhq/server' <script>`, or `bun run
test:server` for unit + integration. Locally in `apps/server/`: `bun run
start:dev`, `bun run db:migrate`, etc. `docker compose -f compose.yaml up -d`
brings up Postgres + Mailpit.

## Conventions

- Everything in **English**: directories, files, classes, functions, variables,
  comments, API messages.
- Feature-first architecture, cohesive NestJS modules. **A feature module must
  not import another feature module directly** — talk through a provider
  interface or an event. Enforced by `bun run lint:boundaries`
  (`eslint-plugin-boundaries`; this is the one lint rule not handled by the
  repo-wide Biome).
- Formatting + general lint: **Biome**, configured at the repo root
  (`biome.json`). Do not add a local Biome or Prettier config.
- **Manual API collection** in [`http/`](http/): one runnable Hurl file per
  request, one directory per endpoint group (`http/README.md`). Hand-run, not
  CI; automated coverage stays in `src/**/*.e2e-spec.ts`.
- **Every design decision or notable change → a page under
  [`docs/technical/`](../../docs/technical/)** (context, alternatives,
  consequences). Link it, do not duplicate it. See
  [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Definition of Done

- The relevant `docs/technical/` page is updated if a decision was made or changed.
- Tests created / updated and **green**; typecheck green.
- Any HTTP endpoint added, changed or removed → the matching
  `http/<group>/*.hurl` file created / updated / deleted in the same change, its
  assertions still pass against a locally running server, and `http/README.md`'s
  layout block kept in sync.
- `CHANGELOG.md`: an entry under `## [Unreleased]` as soon as `src/` changes.
  _Keep a Changelog_ format, SemVer.
- If protocol behaviour changes: [`docs/protocol/`](../../docs/protocol/) and its
  `CHANGELOG.md` updated in the same change.
- Prisma migrations included where applicable.

## CHANGELOG entries

`CHANGELOG.md` records **what changed**, not why. One bullet per user-visible
change, **one line** (two at most), tagged with its issue.

- No paragraphs, no version pins (those live in `package.json`).
- **No parenthetical dump of identifiers, config keys, defaults or file names.**
  Name the capability, not its internals.
- If you need "and" more than once, split into that many bullets or cut detail.

Rationale, trade-offs, "a design page is owed" → the `docs/technical/` page and the PR body, never the
changelog. The only caveats that belong in a `### Notes` block are ones a
_consumer_ must act on now.
