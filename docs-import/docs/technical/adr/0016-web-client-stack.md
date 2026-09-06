# 0016 — Web client stack

**Status**: accepted

## Context

`client-web` is a demonstration client, not a finished product, but it must be
understandable by a majority of developers and must not become spaghetti. It must
exercise every server feature as it ships.

## Decision

- **React** (latest stable), **Vite**, **TypeScript**.
- **Tailwind CSS 4** (new engine, CSS-first configuration).
- **shadcn/ui** for the component library (components copied into the repo, not a
  runtime dependency; owned and editable).
- Runtime and package manager: **Bun**. Tests: **Vitest** + Testing Library.
- Always target the latest versions.
- Network access **exclusively** through the `sdk-js` SDK — never a direct
  `fetch`.
- Server state: TanStack Query. Minimal local state. No global store for what
  belongs to the server.
- Feature-first structure: `src/features/<domain>/{api,components,hooks,routes}`.
  Cross-feature imports forbidden (`eslint-plugin-boundaries`).
- UI available in **French and English** (i18n catalogues); code identifiers in
  English.

## Consequences

- shadcn/ui components live in the repo and are covered by the repo's license and
  changelog discipline like any other source.
- Tailwind 4's CSS-first config replaces `tailwind.config.js` for most settings.
- The SDK is the only integration surface; a gap in the SDK is fixed in `sdk-js`,
  not worked around in the client.
