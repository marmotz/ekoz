# AGENTS.md — `apps/client-web` (`@ekozhq/client-web`)

Ekoz **demonstration** web client. Not a finished product: good-looking and
complete enough to exercise every server feature as it ships, no more. A feature
shipped in `apps/server` has its testable counterpart here.

Backlog: [`backlog/client-web/`](../../backlog/client-web/). Stack decision:
[ADR 0016](../../docs/technical/adr/0016-web-client-stack.md).

## Stack

- **React** 19, **Vite** 7, **TypeScript**, **Tailwind CSS 4**, **shadcn/ui**
  (components copied into the repo). **Bun**. Tests: **Vitest** + Testing Library.
- Network access **exclusively** through [`@ekozhq/sdk`](../../packages/sdk/)
  (`workspace:*`) — never a direct `fetch`.
- Server state: TanStack Query. Minimal local state, no global store for
  server-owned data.
- Feature-first: `src/features/<domain>/{api,components,hooks,routes}`.
  Cross-feature imports forbidden.
- Formatting + lint: repo-wide **Biome**. No local config.

## Conventions

- Everything in **English**: directories, files, identifiers, comments. UI text
  through i18n catalogues (French + English).
- Every design decision or notable change → an ADR in `docs/technical/adr/`.

## Definition of Done

- An ADR is written if a decision was made or changed.
- Tests created / updated and green; `bun run typecheck` + `bun run lint` green.
- `CHANGELOG.md`: an entry under `## [Unreleased]` as soon as `src/` changes.
- The corresponding server feature is actually exercisable from the UI.
