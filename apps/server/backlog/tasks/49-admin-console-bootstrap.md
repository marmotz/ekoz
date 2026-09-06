# admin console — application bootstrap

**Status**: todo
**Type**: front
**Repo**: ekoz-chat/server
**Issue**: [#49](https://github.com/ekoz-chat/server/issues/49)

Reference: [../features/server-administration/technical.md §4, §5, §6](../features/server-administration/technical.md#4-admin-console--stack).
Mirrors the `client-web` bootstrap
([web client foundations technical](https://github.com/ekoz-chat/client-web/blob/main/backlog/features/web-client-foundations/technical.md)).

Bootstrap only: the `apps/admin/` app builds, lints, tests, runs, shows an app
shell, and wires server access through `@ekoz/sdk` with an owner gate. **No
business screen** — those are the three follow-up tasks.

## To do

1. **Scaffold `apps/admin/`** — TanStack Start (React + Vite), Bun. `package.json`
   `@ekoz-chat/admin`, `private`, scripts `dev` / `build` / `start` /
   `typecheck` / `lint` / `test`. Not a workspace package of the root (consumed
   nowhere); it only _lives_ in `apps/`.
2. **Build stack** — `vite.config.ts` with `tanstackStart()`, `viteReact()`,
   `@tailwindcss/vite` (Tailwind 4, CSS-first), `vite-tsconfig-paths`. TS strict,
   alias `@/*` → `src/*` extending `packages/tsconfig/`.
3. **Styling** — `styles/globals.css` (`@theme` + shadcn tokens for light/dark),
   `components.json` → `src/shared/ui`; copy `button`, `input`, `dropdown-menu`,
   `dialog`, `sheet`, `table`, `badge`, `sonner`, `skeleton`, `avatar`.
4. **i18n** — react-i18next, per-request instance (`app/i18n.ts`), detection
   `localStorage` (`ekoz.admin.lang`) + `Accept-Language` (`server/language.ts`,
   `createServerFn`), `supportedLngs: ['en','fr']`, `fallbackLng: 'en'`,
   namespace `common`. Typed `useTranslation` re-export.
5. **Theme** — `app/theme.tsx` + `theme-script.ts` (inline anti-flash),
   `localStorage` `ekoz.admin.theme`, `light` / `dark` / `system`.
6. **App shell** — `shared/layout/{app-shell,sidebar,topbar,nav-registry}.tsx`.
   Sidebar entries via a `registerNav()` registry (features register their own;
   no cross-import). Topbar: page title, language switcher, theme toggle,
   user menu (sign out, current identifier).
7. **SDK wiring** (`shared/sdk/`) — `client.ts`
   (`createClient({ server: import.meta.env.VITE_EKOZ_SERVER, store })`,
   client-only), `session-store.ts` (`localStorage` key `ekoz.admin.session`,
   tolerant to missing/corrupt), `provider.tsx` (`useEffect` mount, `resume()`),
   `session.ts` (`useSession()`: `unknown` on SSR, then `session:*` events;
   `session:invalid` → `queryClient.clear()` + navigate `/login`).
8. **Owner gate** — `shared/sdk/require-owner.tsx`: skeleton while `unknown`,
   redirect `anonymous` → `/login`, and once authenticated read `sdk.me.get()`
   (`MeView.isOwner`) — render a "not an owner" screen with a sign-out button if
   `false`.
9. **Routing skeleton** — `routes/__root.tsx` (`<html>`/`<head>`, `<AppShell>`),
   `routes/index.tsx` (placeholder redirect, real logic lands with setup+auth),
   `routes/login.tsx` placeholder. `routeTree.gen.ts` committed,
   `linguist-generated`, ESLint-excluded.
10. **TanStack Query** — `app/query-client.ts`: new client per SSR request,
    `staleTime` 30 s, no retry on `4xx` / auth errors, `refetchOnWindowFocus`
    false; `QueryCache.onError` routes unhandled auth errors to sign-out.
11. **Lint / boundaries** — ESLint flat config + `eslint-plugin-boundaries`
    (`routes` may import `shared` / `app` / `server`; `shared` imports only
    `shared`).
12. **Env** — `.env.example` `VITE_EKOZ_SERVER=http://localhost:3001`. No API
    URL hard-coded (discovery resolves it in the SDK).
13. **Tests** — Vitest + jsdom, `test/{setup,render,sdk-mock}.ts`; SDK module
    mocked. Cover: session store round-trip / missing / corrupt; `useSession`
    transitions; `SdkProvider` creates no client on SSR; `RequireOwner`
    (skeleton / redirect / not-owner / owner); theme + language switch.
14. **CI** — a job (root workflow or `apps/admin/.github/...`, aligned with
    [46-monorepo-restructure](46-monorepo-restructure.md) §6): `bun install`,
    `lint`, `typecheck`, `test`, `build`; `@ekoz/sdk` from a sibling checkout +
    `bun link`. CHANGELOG check for `apps/admin/**`.
15. **CHANGELOG.md** — first `apps/admin/` entry under `## [Unreleased]`.

## Dependencies

- [46-monorepo-restructure](46-monorepo-restructure.md) — the `apps/` layout.
- [sdk-js#11](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/tasks/11-admin-console-bindings.md) — the
  SDK must exist and expose the identity + admin surface; consumed via
  `bun link`.
