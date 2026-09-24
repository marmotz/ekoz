# Web client bootstrap

## Context

[Web client stack](web-client-stack.md) fixes the toolbox (React, Vite, Tailwind 4,
shadcn/ui, feature-first, network access only through `@ekozhq/sdk`). This page
records the decisions taken when `apps/client-web` was bootstrapped: what runs the
app, how the shell, theme, language and session are wired, and how CI guards it.
The design lived in
[
`backlog/_archives/features/web-client-foundations/technical.md`](../../backlog/_archives/features/web-client-foundations/technical.md);
this is what shipped.

## Decision

### Foundation: TanStack Start on Vite

`apps/client-web` uses **TanStack Start**, not a plain Vite + React SPA. Its
issue descriptions once flagged a mismatch with an early plain-Vite scaffold; that
is settled: the scaffold is Start, like `apps/admin`. File routes live in
`src/routes` (the generated `routeTree.gen.ts` is committed), server-only code in
`src/server`. A built app is a Node process (see
[admin console Node entry point](admin-console-node-entry.md)).

### Module boundaries

`eslint-plugin-boundaries` (`bun run lint:boundaries`) enforces:

| From            | May import                               |
|-----------------|------------------------------------------|
| `features/<x>`  | `shared`, itself (never another feature) |
| `shared`        | `shared`                                 |
| `routes`        | `shared`, `features`, `app`, `server`    |
| `app`, `server` | `shared`, `app`, `server`                |

Consequence: `shared` cannot read app-level state. The shell is presentational (`AppShell` takes `theme` /
`onThemeChange` / `userMenu` as props) and
`app/app-frame.tsx` binds it to `useTheme()`.

### App shell and navigation

The shell is not rendered by the root route. `routes/__root.tsx` renders the
document, the providers, the `Toaster` and an `<Outlet />`; the pathless layout
`routes/_app.tsx` renders `AppFrame` around its children and fills the top bar
`user-menu` slot with the `auth` feature's `UserMenu` (a `routes` file may import
a feature, `app` may not). Pages that need the shell live under `routes/_app/`
(the home page is `routes/_app/index.tsx`, path `/`); anonymous pages live under
the `routes/_auth` layout, without sidebar. See
[web client authentication](web-client-auth.md).

`AppShell` is a sidebar (from the `md` breakpoint up; a `Sheet` opened from a top
bar button below it), a sticky top bar and a scrollable `<main>`. The top bar shows
the page title (the `staticData.title` translation key of the deepest matching
route), the language switcher, the theme toggle and the `user-menu` slot.

The sidebar renders `shared/layout/nav-registry`: a module-level, de-duplicated
list filled by `registerNav()`. Each feature (or route file) registers its entries
at import time, so the shell never imports a feature. "Home" is the only
navigation link; features that need more than a link (the rooms tree) register a
component with `registerSidebarSection()` from
`shared/layout/sidebar-section-registry`, rendered under the navigation in both the
fixed sidebar and the mobile sheet (see [web client rooms](web-client-rooms.md)).

### Theme

Three choices, `light` / `dark` / `system`, persisted under `ekoz.theme`
(absent means `system`). An inline script in `<head>` sets the `dark` class on
`<html>` before first paint, so a server-rendered page does not flash. The
`ThemeProvider` starts on `system` (matching the server HTML), reads the stored
choice after mount and follows `prefers-color-scheme` while on `system`.

### i18n

`react-i18next` with **one i18next instance per request** (a module-level instance
would leak the language between concurrent SSR requests). The server reads
`Accept-Language` in a server function and passes the language through the root
loader, so server and hydration render the same language. After hydration a
language stored under `ekoz.lang` takes over. Supported: `en`, `fr`;
`fallbackLng: 'en'`. `common` is the default namespace; a feature adds its own
namespace with `addResourceBundle`. Catalogues are bundled statically, and
translation keys are typed from the English catalogue.

### Session

The SDK client and the session are **client-only**: the session lives in the
browser, so there is no server-side session guard.

- `localStorageSessionStore()` implements the SDK `SessionStore` on `ekoz.session`
  (refresh token and identity, never the access token). Missing storage or corrupt
  JSON reads as "no session".
- `SdkProvider` creates the client in an effect and calls `session.resume()`. It
  publishes the client only once `resume()` settled; until then (and during the
  whole server render) `useSdk()` is `null`. The client is kept in a ref so a Strict
  Mode remount does not run two `resume()` calls on the same rotating refresh token.
- `useSession()` returns `{ status, identifier, sessionId }` with `status` one of
  `unknown` (no client yet), `anonymous` or `authenticated`, following the SDK
  `session:*` events.
- `RequireAuth` renders a skeleton while `unknown`, redirects to `/login` when
  `anonymous`, and renders its children when `authenticated`. The `_app` layout
  wraps its outlet in it, so every route under `routes/_app/` is protected; there
  is no loader-level guard.
- `useSession()` consumers: `RequireAuth`; `GuestOnly`, the inverse guard of the
  anonymous pages, which also completes a sign-in by redirecting to `/` once the
  status turns `authenticated`; and `UserMenu`, which renders nothing for an
  anonymous session (see [web client authentication](web-client-auth.md)).
- `SessionGuard` (in `app`, mounted once) reacts to `session:invalid` and to an
  unhandled `AuthenticationError` reaching the query cache: it clears the query
  cache and navigates to `/login`. It lives in `app` rather than in `useSession()`
  so the effect runs once, not once per component using the hook, and because the
  query-error signal is an `app` concern that `shared` may not import.

In dev the client passes `resolveApiUrl` instead of `server`: the SDK's discovery
always uses `https://<domain>/.well-known/ekoz`, while the reference server runs
plain HTTP locally (same approach as `apps/admin`). Cross-origin calls to the dev
server need its origin in `EKOZ_HTTP__CORS_ALLOWED_ORIGINS`.

`<body>` carries `suppressHydrationWarning`: browser extensions inject attributes
into it before React hydrates, which would otherwise log a spurious mismatch.

### SDK distribution and CI

`@ekozhq/sdk` is a `workspace:*` dependency: the monorepo resolves it to
`packages/sdk`, so there is no `bun link` and no checkout of a second repository.
The root `bun run build` builds it before the apps consume it. The existing CI
workflow (`.github/workflows/ci.yml`) already runs lint, boundaries, typecheck,
tests and builds for every workspace; it gained a `changelog` job for pull
requests, running `scripts/check-changelog.sh`: a change under a workspace's
`src/` (tests excluded) needs a new line under `## [Unreleased]` of that app's
`CHANGELOG.md`, or a new changeset for `packages/sdk`. No deployment job.

## Alternatives

| Topic                 | Chosen                                                        | Rejected                                    | Why                                                                                                                                                          |
|-----------------------|---------------------------------------------------------------|---------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Foundation            | TanStack Start                                                | Plain Vite SPA + TanStack Router            | Same routing API, server functions available (language detection), same base as `apps/admin`. The Node runtime cost is accepted; the SPA stays the fallback. |
| SDK execution         | Client only                                                   | Also in server functions                    | The session store is `localStorage` and refresh is in memory; running it server-side would require an httpOnly-cookie model nobody needs yet.                |
| Session guard         | `RequireAuth` component                                       | Loader `beforeLoad` guard                   | The session is not readable on the server.                                                                                                                   |
| Shell placement       | Pathless `_app` layout route                                  | Shell in the root route                     | Anonymous pages must render without it, and the layout can compose a feature (`UserMenu`).                                                                   |
| Language detection    | `Accept-Language` on the server + stored choice on the client | Client-side detection only                  | Avoids a language flash and a hydration mismatch.                                                                                                            |
| Navigation            | `registerNav()` registry                                      | Hand-edited central list                    | Keeps features from importing the shell or each other.                                                                                                       |
| Test network boundary | Mock the `@ekozhq/sdk` module                                 | MSW                                         | The client performs no `fetch` of its own; the SDK API is the useful seam.                                                                                   |
| SDK in CI             | `workspace:*`                                                 | `bun link` from a sibling checkout, tarball | The SDK is in the same repository.                                                                                                                           |
| Changelog check       | Shell script, tested with Vitest                              | Third-party action                          | A few lines of `git diff`, and it also covers changesets.                                                                                                    |

## Consequences

- The first render of a protected page is a skeleton, on the server and until the
  client resolved the session; a user with a stored session sees no `/login` flash
  because `unknown` never redirects.
- `useSdk()` is `null` for as long as `resume()` takes, so the login screen waits
  for one refresh round trip when a stale refresh token is stored.
- A gap in the SDK is fixed in `packages/sdk`, never worked around in `shared/sdk`.
