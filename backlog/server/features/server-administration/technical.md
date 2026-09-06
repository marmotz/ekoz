# Server administration — technical design

First increment only: turn this repo into a Bun-workspaces monorepo, add the
few read/reset endpoints the console needs, and build the **admin console**
application (`apps/admin/`) covering server initialization and account
administration.

Builds on [identity and profiles](../identity-and-profiles/technical.md) and
[server core](../server-core/technical.md). Product scope is settled in
[overview.md](./overview.md).

Related:
[ADR 0009](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0009-configuration-model.md),
[ADR 0010](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0010-server-initialization.md),
[ADR 0016](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0016-web-client-stack.md),
[ADR 0017](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0017-api-conventions.md),
[ADR 0019](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0019-backlog-lives-in-the-implementing-repo.md),
[ADR 0001](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0001-repository-layout.md).
`sdk-js`:
[SDK foundations technical](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/technical.md).
`client-web`:
[web client foundations technical](https://github.com/ekoz-chat/client-web/blob/main/backlog/features/web-client-foundations/technical.md)
(the console mirrors its stack).

## 1. Scope

In scope for this increment:

1. **Repo restructure** into Bun workspaces — already carved out as
   [task #46](../../tasks/46-monorepo-restructure.md); this document only frames
   the target layout and the ADR (§3, §9).
2. **Server additions** (small, in `apps/backend/` after the move):
   - `GET /admin/users` — list / search / filter (owner-only);
   - `GET /admin/users/:id` — admin-facing account detail (owner-only);
   - `POST /admin/users/:id/password-reset` — owner-triggered reset mail;
   - `GET /setup` — public setup-state probe;
   - CORS support (the console is a separate origin).
3. **Admin console** application `apps/admin/` — a TanStack Start app covering:
   server initialization (owner setup, email- or token-pinned), owner sign-in
   and sign-out, account list, account detail, account creation, suspension /
   unsuspension, deletion, owner grant / revoke, username-change request review
   (list / approve / reject), invitation management (list / create / revoke),
   owner-triggered password reset.
4. **`sdk-js` bindings** for the four new endpoints, folded into
   [sdk-js task #8](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/tasks/8-invitations-and-admin-resources.md).

Out of scope (later increments, see overview.md): audit-log viewer, runtime
configuration editing, global moderation and reports, supervision dashboards,
federation state, spaces/rooms administration.

No database migration is needed — every new endpoint reads or reuses existing
models (`User`, `UsernameChangeRequest`, `Invitation`, the password-reset
machinery).

## 2. Server additions

### 2.1 `GET /admin/users` (owner-only)

New controller method on `AdminUsersController`
([registration.controller.ts:41](../../../src/modules/identity/accounts/registration.controller.ts))
or a dedicated `AdminUserQueryController` in the same folder — guarded
`AuthGuard, OwnerGuard` like its siblings.

Query params (all optional): `q` (substring match on `name` / `email` /
`UserProfile.displayName`), `status` (`active` / `suspended` / `deleted`),
`owner` (`true` / `false`), `cursor`, `limit` (default 50, max 200). Keyset
pagination on `(createdAt desc, id desc)`.

Response: `{ items: AdminUserListItem[], nextCursor: string | null }` where
`AdminUserListItem` is `AccountView`
([account.view.ts:5](../../../src/modules/identity/accounts/account.view.ts))
plus `createdAt`, `suspendedAt`, `suspendedReason`. `email` is included (owner
context, unlike the public `GET /users/:identifier`).

Search over `displayName` needs a join to `UserProfile`; use raw Prisma SQL
(`$queryRaw`) per the repo convention on FTS/search, or a simple `ILIKE` across
the joined columns for this volume. Read-only, no audit entry.

### 2.2 `GET /admin/users/:id` (owner-only)

Single account, same shape as the list item plus `emailVerifiedAt` and the
active-session count (`Session.where(userId, revokedAt null)`), the latter a
cheap "is this account in use" hint pending the real supervision increment.
`404 identity.user_not_found` when absent.

### 2.3 `POST /admin/users/:id/password-reset` (owner-only)

Owner-triggered reset: reuses `PasswordResetService`
([password-reset.controller.ts](../../../src/modules/identity/accounts/password-reset.controller.ts))
to mint a token and send the existing reset mail to the account's address.
Differs from the public `POST /auth/password-reset/request` in that it takes a
user id (not an email), requires an owner, is **not** behind
`SensitiveThrottleGuard`, and returns `202 { accepted: true }`. `404` if the
user does not exist; `409 identity.account_deleted` if `status = deleted` or
`email` is null. Audit action `identity.password_reset_triggered`
(`actorUserId` = owner, `targetType: 'user'`, `targetId: id`).

`PasswordResetService` currently exposes `request(email, ip)`; add
`requestForUser(userId, actorUserId)` or expose an internal `issueFor(user)` it
can share. Confirmed against
[password-reset.service.ts](../../../src/modules/identity/accounts/password-reset.service.ts)
at task time.

### 2.4 `GET /setup` (public)

`@Public()`, no guard, so the console can branch before anyone signs in.
Returns `{ state: 'email-pinned' | 'token-pinned' | 'closed' }` straight from
`SetupService.resolveState()`
([setup.service.ts:47](../../../src/core/bootstrap/setup.service.ts)). It does
**not** return the pinned email (kept server-side; the form collects it and the
service validates). Cache-Control `no-store`.

Lives on a new `SetupStateController` under `@Controller('setup')` — note
`SetupController` is `@UseGuards(SetupGuard)` which would 410 this route once
closed, so the state probe must be a separate controller **without**
`SetupGuard`.

### 2.5 CORS

The server enables CORS today nowhere
([main.ts](../../../src/main.ts), no `app.enableCors`). The console and
`client-web` run on their own origins and only ever send a bearer token in
`Authorization` (no cookies), so a plain allow-list CORS is enough — no
`credentials: true`.

- New **infra** parameter `http.cors_allowed_origins`
  ([registry.ts](../../../src/core/config/registry.ts), `list: true`, default
  `[]`). Empty list ⇒ CORS stays off (current behaviour).
- `main.ts`: after config resolves, `app.enableCors({ origin: <list>, methods:
[...], allowedHeaders: ['authorization', 'content-type', 'x-request-id'],
exposedHeaders: ['x-request-id'], maxAge: 600 })` when the list is non-empty.
- `config.example.toml` / `.env.example`: document the key with the local dev
  origins (`http://localhost:3000` client-web, `http://localhost:3002` admin —
  ports to confirm).

Preflight (`OPTIONS`) is handled by the Nest/Express CORS middleware before the
global `BaselineAuthGuard`
([baseline-auth.guard.ts](../../../src/core/http/baseline-auth.guard.ts)), so no
guard change is needed.

### 2.6 `http/` collection

One file per outcome, per `http/README.md`:

```
http/admin/
  users-list.hurl                 GET /admin/users              200 · owner
  users-list-forbidden.hurl       GET /admin/users              403 · non-owner
  user-get.hurl                   GET /admin/users/:id          200 · owner
  user-get-not-found.hurl         GET /admin/users/:id          404
  user-password-reset.hurl        POST /admin/users/:id/password-reset  202
setup/
  state.hurl                      GET /setup                    200
```

Keep the layout block in `http/README.md` in sync.

## 3. Monorepo layout

Target (task #46 owns the mechanics):

```
/ (root, private, "workspaces": ["apps/*", "packages/*"])
  apps/
    backend/        # today's repo root: src/ prisma/ http/ docker/ ...
    admin/          # this increment — the admin console
  packages/
    tsconfig/       # shared compiler base
```

`client-web` and `sdk-js` stay separate repos
([ADR 0019](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0019-backlog-lives-in-the-implementing-repo.md));
only the admin console joins this repo, because it ships with the reference
server. During bring-up `apps/admin/` consumes `@ekoz/sdk` via `bun link` from a
sibling `sdk-js` checkout — it is **not** a workspace package here.

Root scripts delegate to `apps/backend` so existing muscle memory
(`bun run test`, `typecheck`, `db:*`, `start:dev`) keeps working; `apps/admin`
has its own `dev` / `build` / `test`. Full step list in
[task #46](../../tasks/46-monorepo-restructure.md).

## 4. Admin console — stack

Mirrors `client-web`
([web client foundations technical](https://github.com/ekoz-chat/client-web/blob/main/backlog/features/web-client-foundations/technical.md)),
so an operator or contributor sees one stack across both apps:

| Topic                   | Choice                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Base                    | **TanStack Start** (React + Vite, SSR + hydration, Nitro server, Node output)                                                        |
| Styling                 | Tailwind CSS 4 (CSS-first), shadcn/ui copied into `src/shared/ui`                                                                    |
| Server state            | TanStack Query (new `QueryClient` per SSR request)                                                                                   |
| Routing                 | TanStack Router (bundled with Start), typed route tree                                                                               |
| i18n                    | react-i18next, per-request instance, `localStorage` + `Accept-Language` detection, `fallbackLng: 'en'`, `supportedLngs: ['en','fr']` |
| Theme                   | `light` / `dark` / `system`, `localStorage` (`ekoz.admin.theme`), inline anti-flash script                                           |
| Network                 | **only** through `@ekoz/sdk`; SDK is client-only; `SessionStore` on `localStorage` (`ekoz.admin.session`)                            |
| Package manager / tests | Bun / Vitest + Testing Library, SDK module mocked (no MSW)                                                                           |
| Lint                    | ESLint flat config + `eslint-plugin-boundaries`                                                                                      |

Deviation from `client-web`: **no public routes**. Every screen except
`/setup` and `/login` is behind an owner gate, so SSR here only buys the i18n /
theme anti-flash and a consistent build with `client-web`. This is the reason
the "Vite SPA" alternative was considered and rejected (§8) — consistency won.

Key deployment: still a static-ish deploy plus a Node process
(`node .output/server/index.mjs`), separate origin, **NestJS never serves these
assets** (overview.md).

## 5. Admin console — target tree

```
apps/admin/
  package.json          # @ekoz-chat/admin, private; scripts dev/build/start/typecheck/lint/test
  vite.config.ts        # tanstackStart(), viteReact(), tailwindcss(), tsconfigPaths()
  vitest.config.ts      # environment jsdom
  eslint.config.js      # flat config + boundaries
  components.json        # shadcn -> src/shared/ui
  .env.example          # VITE_EKOZ_SERVER=http://localhost:3001
  src/
    router.tsx
    routeTree.gen.ts     # generated, linguist-generated, ESLint-excluded
    styles/globals.css
    app/
      providers.tsx      # I18nextProvider, ThemeProvider, SdkProvider (client)
      query-client.ts
      i18n.ts
      theme.tsx / theme-script.ts
    server/
      language.ts        # createServerFn: Accept-Language -> 'en' | 'fr'
    routes/
      __root.tsx         # <html>/<head>, <AppShell><Outlet/>
      index.tsx          # redirect: -> /login or /setup or /users
      setup.tsx          # owner setup (email- or token-pinned)
      login.tsx          # owner sign-in
      users/
        index.tsx        # account list (search, status filter)
        $userId.tsx      # account detail + lifecycle actions
        new.tsx          # create account
      invitations.tsx    # list / create / revoke
      username-requests.tsx  # list / approve / reject
    shared/
      sdk/               # client.ts, session-store.ts, provider.tsx, session.ts, require-owner.tsx
      ui/                # shadcn components
      layout/            # app-shell, sidebar, topbar, nav-registry
      i18n/locales/{en,fr}/{common,users,invitations,setup}.json
      lib/utils.ts
  test/
    setup.ts / render.tsx / sdk-mock.ts
  .github/workflows/ci.yml   # or a job added to the root workflow (task #46 §6)
```

Feature-first boundaries as in `client-web` §5: `routes` may import `shared` /
`app` / `server`; `shared` imports only `shared`. There are no `src/features/*`
folders in this increment (the console screens live directly under `routes/`);
a `features/` split can come with the moderation increment.

## 6. Session, owner gate, setup flow

- `shared/sdk/client.ts`: `createClient({ server: import.meta.env.VITE_EKOZ_SERVER, store })`,
  client-only (`useEffect` mount), `resume()` if the store has a refresh token
  ([SDK technical §7](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/technical.md)).
- `shared/sdk/session.ts`: `useSession()` — `unknown` during SSR, then
  `authenticated` / `anonymous` driven by `session:*` events; on
  `session:invalid` → `queryClient.clear()` + navigate `/login`.
- `shared/sdk/require-owner.tsx`: `<RequireOwner>` renders a skeleton while
  `unknown`, redirects `anonymous` → `/login`, and — once authenticated —
  reads `sdk.me.get()` (`MeView.isOwner`,
  [profile.service.ts:20](../../../src/modules/identity/profile/profile.service.ts))
  and renders a "not an owner" screen (with a sign-out button) if
  `isOwner === false`. Only owners can use this console; there is no
  non-owner admin role in this increment.
- **Setup flow**: `routes/index.tsx` loader calls `sdk.setup.state()`:
  - `closed` → redirect `/login`;
  - `email-pinned` → `/setup`, form asks for the pinned email + password +
    identifier + display name, submits `POST /setup/owner`;
  - `token-pinned` → `/setup`, form additionally asks for the single-use token
    printed in the server logs.
    A `410 setup.closed` from `POST /setup/owner` (race) surfaces as "already
    initialized, sign in". On success the SDK stores the returned session
    ([setup-owner.service.ts](../../../src/modules/identity/accounts/setup-owner.service.ts))
    and the console lands on `/users`.

## 7. Screen → endpoint map

| Screen                 | Endpoint(s)                                                         | Guard               |
| ---------------------- | ------------------------------------------------------------------- | ------------------- |
| Setup                  | `GET /setup`, `POST /setup/owner`                                   | public / SetupGuard |
| Sign in / out          | `POST /auth/login`, `POST /auth/logout`, refresh (SDK-internal)     | public / AuthGuard  |
| Account list           | `GET /admin/users` _(new)_                                          | OwnerGuard          |
| Account detail         | `GET /admin/users/:id` _(new)_                                      | OwnerGuard          |
| Create account         | `POST /admin/users`                                                 | OwnerGuard          |
| Suspend / unsuspend    | `POST /admin/users/:id/suspend`, `.../unsuspend`                    | OwnerGuard          |
| Delete account         | `DELETE /admin/users/:id`                                           | OwnerGuard          |
| Trigger password reset | `POST /admin/users/:id/password-reset` _(new)_                      | OwnerGuard          |
| Grant / revoke owner   | `POST /admin/owners`, `DELETE /admin/owners/:userId`                | OwnerGuard          |
| Username requests      | `GET /admin/username-requests`, `.../:id/approve`, `.../:id/reject` | OwnerGuard          |
| Invitations            | `GET /invitations`, `POST /invitations`, `DELETE /invitations/:id`  | OwnerGuard          |

Existing endpoint references:
[lifecycle.controller.ts](../../../src/modules/identity/accounts/lifecycle.controller.ts),
[username.controller.ts](../../../src/modules/identity/accounts/username.controller.ts),
[invitations.controller.ts](../../../src/modules/identity/invitations/invitations.controller.ts),
[auth.controller.ts](../../../src/modules/identity/auth/auth.controller.ts).

## 8. `sdk-js` impact

Fold into
[sdk-js task #8](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/tasks/8-invitations-and-admin-resources.md)
(`invitations` and `admin.*` bindings) plus a touch of #6 (`setup`):

- `sdk.setup.state()` → `GET /setup`;
- `sdk.admin.users.list(params)` → `GET /admin/users` (typed `AdminUserListItem`,
  cursor helper);
- `sdk.admin.users.get(id)` → `GET /admin/users/:id`;
- `sdk.admin.users.triggerPasswordReset(id)` → `POST /admin/users/:id/password-reset`.

The wire types are aligned with the targeted protocol version; a mismatch with
`spec/docs/protocol/` is fixed in `spec`, not worked around
([SDK overview](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/features/sdk-foundations/overview.md)).
Consumed here via `bun link` (no publish).

## 9. ADR to write (in `spec`)

**One combined ADR: "Reference server monorepo and admin console".** Supersedes
the standalone monorepo ADR planned in task #46 §1 (that step becomes "write the
combined ADR").

Expected content:

- The `server` repo is a Bun-workspaces monorepo: `apps/backend`, `apps/admin`,
  shared config in `packages/`. Refines
  [ADR 0001](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0001-repository-layout.md).
  `client-web` and `sdk-js` stay separate (ADR 0019).
- The admin console is a core app of the reference server, deployed on its own
  origin; NestJS does not serve it.
- Stack: TanStack Start, mirroring `client-web` (ADR 0016 + its bootstrap ADR);
  the SSR runtime is accepted for stack consistency even though the console has
  no public pages.
- Network only through `@ekoz/sdk`; owner-only access (`RequireOwner`,
  `MeView.isOwner`); no non-owner admin role yet.
- Server-side additions: `GET /admin/users`, `GET /admin/users/:id`,
  `POST /admin/users/:id/password-reset`, `GET /setup`, and the
  `http.cors_allowed_origins` infra parameter with `app.enableCors`.

Next free number after `0025` (sdk-js packaging) and `0026` (client-web
bootstrap); confirm at writing — first of the pending ADRs delivered takes the
lower number.

## 10. Alternatives considered

| Topic                    | Chosen                                     | Rejected                                                                        | Why                                                                                                                                                                      |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Console base             | TanStack Start                             | Vite SPA + bare TanStack Router                                                 | User decision. SPA was the natural fit (no public pages, static deploy, ADR 0016 says "Vite"), but one shared stack with `client-web` outweighed the extra Node runtime. |
| User administration data | Add `GET /admin/users[/:id]` now           | Keep the console "blind" (operator types ids); or defer the whole user-admin UI | User decision. The list/detail reads are small and unlock the core value of this increment (run account creation in real conditions).                                    |
| Owner password reset     | New `POST /admin/users/:id/password-reset` | Reuse public `POST /auth/password-reset/request` with the account email         | Owner does not necessarily know the address; the public route is throttled and email-keyed.                                                                              |
| Setup-state probe        | New public `GET /setup`                    | Let the console POST `/setup/owner` and read a `410`                            | A cheap probe lets the console show the right screen (setup vs login) before any input, and read whether a token is required.                                            |
| CORS scope               | Origin allow-list, no credentials          | `credentials: true` + cookie session; or same-origin reverse proxy              | The SDK carries a bearer token, never a cookie; the console is explicitly a separate origin.                                                                             |
| Console in this repo     | `apps/admin/` workspace                    | Its own repo like `client-web`                                                  | overview.md: it ships _with_ the reference server.                                                                                                                       |
| SDK consumption          | `bun link` from sibling checkout           | npm publish; vendored copy                                                      | SDK API not stable yet (SDK overview).                                                                                                                                   |
| Admin roles              | Owner-only                                 | A separate `admin` role below owner                                             | Nothing in identity models a sub-owner role; out of scope until moderation.                                                                                              |

## 11. Consequences verified

- **Restructure churn**: every path-bearing config file moves — `nest-cli.json`,
  `tsconfig*.json`, `prisma.config.ts` (`contract`/`migrations`/`output`,
  [prisma.config.ts](../../../prisma.config.ts)), `vitest.config.ts`,
  `eslint.config.mjs`, `lefthook.yml`, `.github/workflows/*`, `Dockerfile`,
  `compose*.yaml`, `docker/entrypoint.sh`. Enumerated in task #46; this feature
  does not re-plan it.
- **No migration**: `User` already carries `status` / `isOwner` / `suspendedAt`
  / `suspendedReason` / `createdAt`
  ([contract.prisma:155](../../../src/core/prisma/contract.prisma)); the new
  endpoints only read.
- **New config parameter**: `http.cors_allowed_origins` is `infra`, so it is
  file/env only and never appears in the (future) runtime-config UI — correct,
  it is a deployment concern. `main.ts` must read it after `app.init()` like the
  other bootstrap parameters (the existing ordering comment applies).
- **`GET /setup` needs its own controller**: `SetupController` is
  `@UseGuards(SetupGuard)`
  ([setup.controller.ts:14](../../../src/modules/identity/accounts/setup.controller.ts));
  reusing it would 410 the probe once setup closes. A sibling controller with no
  guard is required.
- **`PasswordResetService` surface**: today only `request(email, ip)` is public
  ([password-reset.controller.ts](../../../src/modules/identity/accounts/password-reset.controller.ts));
  the owner-triggered path needs a by-user-id entry point on the service —
  small, same mail template and token store.
- **SDK is pre-implementation**: `sdk-js` has only its backlog
  ([sdk-js/backlog](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/));
  the console cannot be built until SDK tasks #1–#8 (plus the new bindings)
  land. Reflected in the task order and `## Feature order` of overview.md.
- **`client-web` bootstrap not shipped either**: its technical design exists,
  tasks not created
  ([client-web technical](https://github.com/ekoz-chat/client-web/blob/main/backlog/features/web-client-foundations/technical.md)).
  The console does not depend on `client-web`, but it will copy patterns from
  it; landing `client-web` bootstrap first keeps the two in step.
- **Two SSR apps to deploy**: operators now run backend + admin console (+ the
  optional demo client), each its own process/origin. The deployment docs and
  `compose*.yaml` gain an `admin` service.
- **Audit coverage**: existing owner actions already audit
  ([invitations.controller.ts](../../../src/modules/identity/invitations/invitations.controller.ts),
  `LifecycleService`); the one new audited action is
  `identity.password_reset_triggered`. The read endpoints are not audited.

## Implementation task breakdown

GitHub issues in `ekoz-chat/server` unless noted. Dependency order:

1. [#46 — monorepo restructure](../../tasks/46-monorepo-restructure.md) (already
   tracked) — plus the combined ADR (§9).
2. [#47 — admin account read endpoints and owner-triggered password reset](../../tasks/47-admin-account-endpoints.md)
3. [#48 — public setup-state probe and CORS support](../../tasks/48-console-reachability.md)
4. [sdk-js#11 — admin console resource bindings](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/tasks/11-admin-console-bindings.md)
   (repo `ekoz-chat/sdk-js`)
5. [#49 — admin console application bootstrap](../../tasks/49-admin-console-bootstrap.md)
6. [#50 — server initialization and owner sign-in](../../tasks/50-admin-console-setup-and-auth.md)
7. [#51 — account administration](../../tasks/51-admin-console-accounts.md)
8. [#52 — invitations and username-change requests](../../tasks/52-admin-console-invitations-and-usernames.md)

#47 / #48 are independent of each other; #50 / #51 / #52 are independent of each
other (all three need #49 and sdk-js#11).
