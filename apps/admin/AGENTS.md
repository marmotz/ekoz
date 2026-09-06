# AGENTS.md — `apps/admin` (`@ekozhq/admin`)

Ekoz **admin console**: the operator UI shipped with the reference server. A core
application of the server, deployed on **its own origin** (the server does not
serve its assets). Distinct from `apps/client-web`, which exercises end-user
features.

Backlog: [`backlog/server/features/server-administration/`](../../backlog/server/features/server-administration/overview.md)
(the console is part of the server-administration feature). Stack decision:
[web client stack](../../docs/technical/web-client-stack.md).

## Stack

- Same as `apps/client-web`: **React** 19, **Vite** 7, **TypeScript**,
  **Tailwind CSS 4**, **shadcn/ui**, **Bun**, **Vitest** + Testing Library.
- Network access **exclusively** through [`@ekozhq/sdk`](../../packages/sdk/)
  (`workspace:*`), owner-scoped resources (`admin.*`, `setup.*`).
- Server state: TanStack Query. Feature-first `src/features/<domain>/…`.
- Formatting + lint: repo-wide **Biome**. No local config.

## Conventions

- Everything in **English**; UI text through i18n catalogues (French + English).
- Owner-only access; never assume more than one owner.
- Every design decision or notable change → a page under `docs/technical/`.

## Definition of Done

- The `docs/technical/` page is updated if a decision was made or changed.
- Tests created / updated and green; `bun run typecheck` + `bun run lint` green.
- `CHANGELOG.md`: an entry under `## [Unreleased]` as soon as `src/` changes.
- The matching server admin capability is actually operable from the console.
