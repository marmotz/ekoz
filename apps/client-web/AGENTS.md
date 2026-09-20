# AGENTS.md — `apps/client-web` (`@ekozhq/client-web`)

Ekoz **demonstration** web client. Not a finished product: good-looking and
complete enough to exercise every server feature as it ships, no more. A feature
shipped in `apps/server` has its testable counterpart here.

Backlog: [`backlog/`](../../backlog/) (client tasks under `web-client-foundations`). Stack decision:
[web client stack](../../docs/technical/web-client-stack.md).

## Stack

- **React** 19, **TanStack Start** on **Vite** 7, **TypeScript**, **Tailwind CSS 4**,
  **shadcn/ui** (components copied into the repo). **Bun**. Tests: **Vitest** + Testing Library.
- Layout: `src/app` (providers, i18n, theme, query client), `src/server` (server
  functions), `src/routes` (file routes), `src/shared` (ui, layout, i18n, lib),
  `src/features/<domain>`. Boundaries are enforced by `bun run lint:boundaries`.
- Network access **exclusively** through [`@ekozhq/sdk`](../../packages/sdk/)
  (`workspace:*`) — never a direct `fetch`.
- Server state: TanStack Query. Minimal local state, no global store for
  server-owned data.
- Feature-first: `src/features/<domain>/{api,components,hooks,routes}`.
  Cross-feature imports forbidden.
- Formatting + lint: repo-wide **Biome**. ESLint (`eslint.config.js`,
  `lint:boundaries`) adds `eslint-plugin-boundaries` plus the recommended, React hooks
  and React refresh rule sets.

## Conventions

- Everything in **English**: directories, files, identifiers, comments. UI text
  through i18n catalogues (French + English).
- Every design decision or notable change → a page under `docs/technical/`.

## Definition of Done

- The `docs/technical/` page is updated if a decision was made or changed.
- Tests created / updated and green; `bun run typecheck`, `bun run lint` and
  `bun run lint:boundaries` green.
- `CHANGELOG.md`: an entry under `## [Unreleased]` as soon as `src/` changes.
- The corresponding server feature is actually exercisable from the UI.
