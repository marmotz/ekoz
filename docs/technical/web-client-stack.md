# Web client stack

## Context

`client-web` is a demonstration client, not a finished product, but it must be
understandable by a majority of developers and must not become spaghetti. It must
exercise every server feature as it ships.

## Decision

- **React** (latest stable), **Vite**, **TypeScript**.
- **TanStack Start** (TanStack Router + SSR) on top of Vite, shared by
  `apps/client-web` and `apps/admin`: typed routing, server-side language
  detection, an anti-flash theme script. The SDK and the session stay client-only.
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
  Cross-feature imports forbidden (`eslint-plugin-boundaries`, run as
  `lint:boundaries`; Biome stays the only formatter and general linter, ESLint
  has this single job).
- UI available in **French and English** (i18n catalogues); code identifiers in
  English.

## Consequences

- shadcn/ui components live in the repo and are covered by the repo's license and
  changelog discipline like any other source.
- Start adds a server runtime: a built app is a Node process (`bun run start`),
  not static files. At the installed version the build emits a Web-standard
  `fetch` handler, wrapped by a small `server.entry.mjs` (see
  [admin console Node entry point](admin-console-node-entry.md)).
- Tailwind 4's CSS-first config replaces `tailwind.config.js` for most settings.
- The SDK is the only integration surface; a gap in the SDK is fixed in `sdk-js`,
  not worked around in the client.
