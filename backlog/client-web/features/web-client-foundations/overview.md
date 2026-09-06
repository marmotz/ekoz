# Web client foundations

**Status**: technical design — see [technical.md](./technical.md)

## Context

The `client-web` repository is empty. It is the Ekoz **demonstration** web
client (see the repo `AGENTS.md` and
[web client stack](../../../../docs/technical/web-client-stack.md)):
not a finished product, but good-looking and complete enough to exercise every
server feature as it ships. The reference server has shipped its identity layer,
so a real UI needs to exist before any identity flow can be exercised.

This feature is the **bootstrap only**. The identity flows themselves are split
into two follow-up features:

- `auth` — registration, email verification, login / logout, password reset.
- `profile` — read / update profile, avatar, email change, username, session
  list / rename / revoke.

## Goal

Deliver a runnable, well-organised demonstration client shell that later
features plug into: build tooling, lint with boundaries, i18n, routing, an
application layout, server-state wiring and SDK session handling, all against a
running reference server, with no domain feature implemented yet.

## Decisions made

- Stack per
  [web client stack](../../../../docs/technical/web-client-stack.md):
  React, Vite, TypeScript, Tailwind CSS 4, shadcn/ui (components copied in),
  Bun, Vitest + Testing Library, TanStack Query for server state, feature-first
  structure (`src/features/<domain>/{api,components,hooks,routes}`) with
  cross-feature imports forbidden (`eslint-plugin-boundaries`).
- All network access goes through
  [`sdk-js`](https://github.com/ekoz-chat/sdk-js), never a direct `fetch`. A gap
  in the SDK is fixed in `sdk-js`, not worked around here.
- During bring-up the SDK is consumed via `npm link` / `bun link` from a sibling
  checkout; no dependency on a published version yet.
- UI available in French and English (i18n catalogues); code identifiers in
  English.
- Application shell: persistent sidebar navigation plus a topbar, with light and
  dark theme support delivered from the bootstrap (not deferred).
- Rendering base: **TanStack Start** (SSR + hydration, Nitro server runtime) on
  top of the the web client stack design stack — this extends the web client stack design, which only named Vite.
  Routing is TanStack Router (bundled with Start). The SDK runs client-side
  only.
- i18n via react-i18next; language detected from `localStorage` then the
  `Accept-Language` header, `en` as fallback; switcher in the topbar.
- Scope of this feature: app bootstrap only — build, lint, i18n, routing,
  TanStack Query provider, application layout (sidebar + topbar + theme
  switch), and SDK client / session wiring. No `auth` or `profile` code here
  beyond the seams they need.
- Out of scope: all domain features (`auth`, `profile`, and later conversations,
  presence, notifications, content sharing). Added feature by feature as the
  server ships them.
- Every design decision or notable change is written up under `docs/technical/`.

## Dependencies

- [SDK foundations](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/overview.md):
  the only integration surface; must expose the identity bindings before `auth`
  and `profile` can be built (not strictly required for this bootstrap).

## Feature order

1. **web-client-foundations** (this feature) — the bootstrap.
2. [`auth`](../auth/overview.md) — depends on this feature and on the SDK
   identity bindings.
3. [`profile`](../profile/overview.md) — depends on `auth`.

Every later client feature (conversations UI, notifications, sharing) builds on
this bootstrap and follows the matching server feature.
