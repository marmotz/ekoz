# Auth — technical design

Technical design for the authentication flows of `apps/client-web`, the public
policy endpoint they need in `apps/server`, the matching binding in `packages/sdk`,
and the React form generator they need in kurotako. Product decisions are in
[overview.md](./overview.md); this page grounds them in the code.

Related: [identity protocol](../../../docs/protocol/identity.md),
[authentication and sessions](../../../docs/technical/auth-and-sessions.md),
[web client bootstrap](../../../docs/technical/web-client-bootstrap.md),
[web client stack](../../../docs/technical/web-client-stack.md),
[OpenAPI description and SDK types](../../../docs/technical/openapi-description-and-sdk-types.md),
[HTTP API conventions](../../../docs/technical/api-conventions.md).

## 1. Findings from the current code

| #   | Finding                                                                                                                                                                                                                                                      | Where                                                                                                                                                                                                                                                                                                                                                  | Consequence                                                                                                        |
|-----|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------|
| F1  | `registration.mode` (`open` / `invite` / `admin`) and `email.verification_required` are runtime, hot-reloadable settings. No unauthenticated endpoint exposes them.                                                                                          | [registry.ts:202](../../../apps/server/src/core/config/registry.ts), [registry.ts:209](../../../apps/server/src/core/config/registry.ts)                                                                                                                                                                                                               | A client cannot pick the right registration form; a new public read is needed.                                     |
| F2  | `GET /setup` is the existing public probe: `@Public()`, `Cache-Control: no-store`, a sibling controller so that it survives setup closing.                                                                                                                   | [setup-state.controller.ts:19](../../../apps/server/src/modules/identity/accounts/setup-state.controller.ts)                                                                                                                                                                                                                                           | Pattern to follow for the new endpoint.                                                                            |
| F3  | The discovery document is cacheable for 5 minutes and is read by peer servers; it carries identity and infrastructure data, not runtime policy.                                                                                                              | [discovery.controller.ts](../../../apps/server/src/core/discovery/discovery.controller.ts), [discovery.md](../../../docs/protocol/discovery.md)                                                                                                                                                                                                        | Not the place for hot-reloadable settings.                                                                         |
| F4  | The password policy is a server constant (`MIN_PASSWORD_LENGTH = 10`, plus a common-password list) enforced in `assertAcceptable`, not in the DTO. The generated Zod schema therefore only says `password: z.string().min(1).max(1024)`.                     | [password.service.ts:6](../../../apps/server/src/modules/identity/accounts/password.service.ts), [RegisterDto.schema.ts](../../../packages/sdk/src/generated/api/zod-api/RegisterDto.schema.ts)                                                                                                                                                        | A generated form cannot enforce the minimum length by itself; the client needs it from the server.                 |
| F5  | The mails already point at client routes built from `server.web_url`: `/verify-email?token=`, `/reset-password?token=`, `/register?invite=`.                                                                                                                 | [email-verification.service.ts:84](../../../apps/server/src/modules/identity/email-verification/email-verification.service.ts), [password-reset.service.ts:116](../../../apps/server/src/modules/identity/accounts/password-reset.service.ts), [invitation.service.ts:58](../../../apps/server/src/modules/identity/invitations/invitation.service.ts) | Route paths and query parameter names are fixed by the server; nothing to change there.                            |
| F6  | An invitation may be bound to an email address; a mismatch throws `identity.invitation_invalid`. The link carries only the token.                                                                                                                            | [invitation.service.ts:97](../../../apps/server/src/modules/identity/invitations/invitation.service.ts)                                                                                                                                                                                                                                                | The register form cannot pre-fill the email; the mismatch is reported on the invitation field.                     |
| F7  | `email_not_verified` is raised only after the password checked out, so it never reveals whether an account exists.                                                                                                                                           | [auth.service.ts:71](../../../apps/server/src/modules/identity/auth/auth.service.ts)                                                                                                                                                                                                                                                                   | Login may safely offer a "resend the verification mail" path.                                                      |
| F8  | `register` returns no tokens; when verification is off the account is created already verified and no mail is sent.                                                                                                                                          | [registration.service.ts](../../../apps/server/src/modules/identity/accounts/registration.service.ts)                                                                                                                                                                                                                                                  | A "check your mailbox" screen is wrong when `email.verification_required = false`; the screen must adapt (see C5). |
| F9  | The SDK `auth` resource already binds `register`, `login`, `logout`, `verifyEmail`, `resendVerification`, `requestPasswordReset`, `confirmPasswordReset`. `login` establishes the session with `identifier: null` (the login response carries no user).      | [auth.ts](../../../packages/sdk/src/resources/auth.ts)                                                                                                                                                                                                                                                                                                 | Reused as is. After login the client learns who is signed in through `GET /me`, not from the session.              |
| F10 | Logout goes through `SessionManager.logout`, which always emits `session:invalid` with reason `logout`; `SessionGuard` reacts by clearing the query cache and navigating to `/login`.                                                                        | [session-manager.ts](../../../packages/sdk/src/session/session-manager.ts), [session-guard.tsx:26](../../../apps/client-web/src/app/session-guard.tsx)                                                                                                                                                                                                 | The sign-out action only calls `auth.logout()`; it must not navigate itself.                                       |
| F11 | `__root.tsx` wraps every route in `AppFrame` (sidebar + top bar), so an anonymous visitor would get the full shell on `/login`. The top bar has a `user-menu` slot that `AppFrame` does not fill. Boundaries: `app` may not import `features`, `routes` may. | [__root.tsx](../../../apps/client-web/src/routes/__root.tsx), [app-frame.tsx](../../../apps/client-web/src/app/app-frame.tsx), [topbar.tsx](../../../apps/client-web/src/shared/layout/topbar.tsx), [eslint.config.js](../../../apps/client-web/eslint.config.js)                                                                                      | The shell moves into a pathless layout route (a `routes` file) that can compose a feature component.               |
| F12 | `client-web` has no form library. The SDK re-exports generated Zod schemas by wire name (`LoginBodySchema`), but kurotako has no React generator (`gen-angular`, `gen-zod`, `gen-typescript` only).                                                          | [package.json](../../../apps/client-web/package.json), [schemas.ts](../../../packages/sdk/src/types/schemas.ts), kurotako `packages/`                                                                                                                                                                                                                  | A `gen-react` generator is created in kurotako (section 4).                                                        |
| F13 | i18n keys are typed from `en/common.json` only; a missing key fails typecheck. The `pages.login.*` keys are placeholder text.                                                                                                                                | [use-translation.ts](../../../apps/client-web/src/shared/i18n/use-translation.ts), [common.json](../../../apps/client-web/src/shared/i18n/locales/en/common.json)                                                                                                                                                                                      | Feature strings go under `auth.*` in both catalogues.                                                              |

## 2. Server changes (`apps/server`, `identity` module)

### S1. `GET /auth/policy`

A new public read, next to `GET /setup` (F2).

- Controller `AuthPolicyController` in `src/modules/identity/auth/`, `@Controller('auth/policy')`,
  `@Public()`, `@Header('Cache-Control', 'no-store')`, registered in
  [identity.module.ts](../../../apps/server/src/modules/identity/identity.module.ts).
- Response (`AuthPolicySchema` + `AuthPolicyDto`, Zod, `@ApiOkResponse`):

  ```ts
  {
    registrationMode: 'open' | 'invite' | 'admin',   // config `registration.mode`
    emailVerificationRequired: boolean,               // config `email.verification_required`
    passwordMinLength: number                         // MIN_PASSWORD_LENGTH
  }
  ```

- Values are read on every request from `ConfigService` (hot reloadable), so a
  change made by the owner shows on the next call. Nothing secret is exposed: the
  same facts are observable by trying to register.
- No dedicated throttle (a cheap read of three values); the global limits apply.

**Alternatives considered**

| Option                                       | Why not                                                                                                                             |
|----------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| Fields in the discovery document (F3)        | Cached 5 minutes, so a mode change is invisible for that long; mixes runtime settings into a document peers consume for federation. |
| Extend `GET /setup`                          | Semantically "is first-owner setup open"; it stays a sibling that answers forever, but it is not about registration.                |
| Client tries to register and reads the error | Cannot render an invitation field or a "closed" message before the user fills a form, and cannot know the password length.          |

### S2. OpenAPI and docs

- `bun run openapi:emit` regenerates [`openapi.json`](../../../apps/server/openapi.json)
  (`openapi:check` guards drift); `/auth/policy` is added to `IN_SCOPE_PATHS` in
  [emit.e2e-spec.ts](../../../apps/server/src/openapi/emit.e2e-spec.ts).
- [identity.md](../../../docs/protocol/identity.md) gets a `GET /auth/policy`
  section (documented first, per its own rule) and an entry in the protocol
  [CHANGELOG](../../../docs/protocol/CHANGELOG.md).
- New page `docs/technical/auth-policy-endpoint.md` (context, alternatives above,
  consequences).
- `apps/server/CHANGELOG.md` entry under `[Unreleased]`.

## 3. SDK changes (`packages/sdk`)

- `AuthResource.policy(): Promise<AuthPolicy>`, an unauthenticated
  `http.request('GET', '/auth/policy')` in [auth.ts](../../../packages/sdk/src/resources/auth.ts),
  next to `register` (same shape as `setup.state()`).
- `bun run generate` produces `AuthPolicyDto`; [wire.ts](../../../packages/sdk/src/types/wire.ts)
  re-exports it as `AuthPolicy` and [schemas.ts](../../../packages/sdk/src/types/schemas.ts)
  as `AuthPolicySchema`; both are exported from `index.ts`.
- Changeset (`@ekozhq/sdk`: minor).
- `login` keeps establishing the session with `identifier: null`. Rejected: having
  the SDK call `GET /me` after login to fill it. It adds a request to every login
  and the identifier would still be `null` after a cold `resume()`; the client
  queries `me` where it needs it (C6).

## 4. Form generation: kurotako `gen-react`

The user decision is to generate the forms rather than hand-write them, and to
use **TanStack Form** (the stack is already TanStack Start / Router / Query).
kurotako cannot do it today (F12), so a feature is created in the kurotako
backlog: [`gen-react`](https://github.com/marmotz/kurotako/blob/develop/backlog/features/generator-react/overview.md).
It is a prerequisite of the client forms and must be **published** before the
client consumes it.

What Ekoz needs from it (the generator's own design belongs to that feature):

- One **headless hook per schema** (for example `useLoginDtoForm`): typed default
  values, validation delegated to the Zod schema emitted by `gen-zod`, per-field
  errors, submit. No JSX: the fields (shadcn/ui, i18n) stay hand-written in
  `features/auth/components`.
- A way to **extend the schema at the call site**: the minimum password length
  comes from `GET /auth/policy` at runtime (F4), so the hook must accept a
  refined schema (for example `password` with `.min(passwordMinLength)`).
- A way to **restrict the emitted entities** to the request bodies used: the `api`
  namespace holds every DTO, and hooks for response DTOs are noise.
- It must work when the Zod generator entry is renamed, as `tako.config.ts` does
  today (`zod-api`), see [tako.config.ts](../../../tako.config.ts).

Wiring in Ekoz once published:

- `tako.config.ts`: `{ use: reactGenerator, namespaces: ['api'], … }` and an output
  `{ dir: './apps/client-web/src/generated', generators: ['zod-api', 'react'] }`.
  The Zod schemas are generated a second time next to the hooks instead of
  imported from `@ekozhq/sdk`: the SDK re-exports them under wire names (`LoginBodySchema`) that a generic generator
  cannot guess, and the generated
  files import each other by relative path. Duplicated output, no duplicated
  source.
- `apps/client-web` gains the `zod` and `@tanstack/react-form` dependencies;
  the root devDependencies gain `@kurotako/gen-react`. `bun run check`
  (`tako check`) already catches drift in CI.
- Network access is unaffected: the hooks hold form state only; submitting still
  goes through `@ekozhq/sdk`.

## 5. Web client changes (`apps/client-web`)

### C1. Route layouts

Two pathless layout routes replace the shell in `__root.tsx`:

| File                                                                                        | Renders                                                                  | Notes                                                                                                                                  |
|---------------------------------------------------------------------------------------------|--------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------|
| `routes/__root.tsx`                                                                         | providers, `Toaster`, `<Outlet />`                                       | No longer renders `AppFrame`.                                                                                                          |
| `routes/_app.tsx`                                                                           | `<AppFrame userMenu={<UserMenu />}><Outlet /></AppFrame>`                | `AppFrame` forwards a `userMenu` prop to `AppShell` (the existing slot). Lives in `routes`, so it may import the `auth` feature (F11). |
| `routes/_app/index.tsx`                                                                     | the current home page                                                    | Moved from `routes/index.tsx`; path `/` unchanged.                                                                                     |
| `routes/_auth.tsx`                                                                          | `AuthLayout`: centered card, language switcher, theme toggle, no sidebar | Component in `features/auth/components`.                                                                                               |
| `routes/_auth/{login,register,check-email,forgot-password,verify-email,reset-password}.tsx` | the six pages                                                            | Thin: `createFileRoute`, `validateSearch`, `staticData.title`, render the page component from `features/auth/routes`.                  |

Every later protected route belongs under `routes/_app/` (for example the rooms
routes planned by `web-client-rooms` as `routes/rooms/...` move to
`routes/_app/rooms/...`), so that it gets the shell.

`routeTree.gen.ts` is regenerated and committed. The old `routes/login.tsx`
placeholder is deleted; `/login` stays the redirect target of `RequireAuth` and
`SessionGuard`.

### C2. Feature layout

```
src/features/auth/
  api/          policy query, one mutation hook per SDK call, error table
  components/   AuthLayout, PasswordInput, field wrappers, forms, UserMenu, GuestOnly
  hooks/        use-auth-error (error -> form / field messages)
  routes/       page components (LoginPage, RegisterPage, ...)
```

New shadcn/ui components under `shared/ui`: `input`, `label`, `card` (and
`@radix-ui/react-label`). Strings live under `auth.*` in `en` and `fr`
`common.json`; the `pages.login.description` placeholder is replaced.

### C3. Server state and errors

- `useAuthPolicy()`: `useQuery(['auth', 'policy'])`, `queryFn: sdk.auth.policy()`,
  `enabled: sdk !== null`, `staleTime: 0` (a hot-reloaded setting must show on the
  next visit, the global 30 s default is too long here).
- Mutations use `useMutation` wrapping the SDK call; nothing is cached.
- Errors are mapped by **error `code`**, in one table (`api/errors.ts`), because not every code has an SDK class (for
  example
  `identity.identifier_invalid` falls back to `EkozError`):

  | Code | Where it is shown |
    |------|-------------------|
  | `auth.invalid_credentials` | login form, generic message (never says which part was wrong) |
  | `identity.account_suspended` | login form |
  | `identity.email_not_verified` | login form, with a link to `/check-email` |
  | `identity.registration_closed` | replaces the register form with the closed message and refetches the policy |
  | `identity.invitation_invalid` | invitation field (also covers an invitation bound to another email) |
  | `identity.email_taken` | email field |
  | `identity.identifier_invalid` | username field |
  | `identity.password_too_weak` | password field, server message key by reason |
  | `identity.email_verification_invalid` | verify-email page, with the resend form |
  | `auth.password_reset_invalid` | reset page, with a link to `/forgot-password` |
  | `auth.too_many_requests` | form-level message with `RateLimitError.retryAfter` seconds |
  | 422 with `issues` | per-field by `path` |
  | anything else (network, 5xx) | generic form-level message |

### C4. Guest-only pages and session states

- `GuestOnly` wraps `login`, `register`, `check-email` and `forgot-password`:
  `useSession()` `unknown` shows a skeleton, `authenticated` navigates to `/`
  (`replace`). It is also what completes a successful login: `session:authenticated`
  flips the state and the redirect follows, no second mechanism.
- `verify-email` and `reset-password` are **not** guest-only: a signed-in user who
  clicks a mail link must not lose the token to a redirect.
- After sign-in the destination is always `/`. Carrying the originally requested
  path is deferred until a protected deep link exists (`RequireAuth` guards no
  page today).

### C5. Pages

| Route                    | Behaviour                                                                                                                                                                                                                                                                                                                                                              |
|--------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `/login`                 | Fields `identifier` (username, `name/server` or email) and `password` (with show/hide). `deviceName` is not sent, the server derives it from the User-Agent ([device-name.ts](../../../apps/server/src/modules/identity/auth/device-name.ts)). Links to `/register` and `/forgot-password`.                                                                            |
| `/register`              | Waits for the policy. `admin`: closed message, no form. `invite`: an invitation field, required, pre-filled from `?invite=`. `open`: no invitation field. Fields `name`, `email`, `displayName`, `password` (minimum length from the policy, show/hide). No confirmation field. Success navigates to `/check-email` with the email in router `state` (not in the URL). |
| `/check-email`           | Reads the email from router `state` (empty after a reload: shows an email input). If `emailVerificationRequired`: "check your mailbox" and a resend action (`resendVerification`, always reported as accepted). If not: "account created, you can sign in" with a link to `/login` and no resend (F8).                                                                 |
| `/forgot-password`       | Email field; the confirmation is identical whether or not the address exists.                                                                                                                                                                                                                                                                                          |
| `/verify-email?token=`   | Verifies once on mount (a ref guard, because the token is single-use and Strict Mode mounts twice). States: pending, success (link to `/login`), invalid or missing token (message and resend form).                                                                                                                                                                   |
| `/reset-password?token=` | New-password field (policy length, show/hide). Success: toast and navigate to `/login` (the server revoked every session). Invalid token: message and link to `/forgot-password`.                                                                                                                                                                                      |

`validateSearch` on `token` and `invite` keeps them typed strings; unknown
parameters are dropped.

### C6. Signed-in user menu

`UserMenu` (in `features/auth/components`) fills the top bar slot: `useMe()`
(`shared/sdk/use-me.ts`, query key `['me']`, delivered by
[#65](https://github.com/marmotz/ekoz/issues/65) of `web-client-rooms`, which
this task therefore depends on) for the display name (initials fallback; the avatar image
is left to the client part of [`identity-and-profiles`](../identity-and-profiles/overview.md)), and a "Sign out" entry
calling
`sdk.auth.logout()` (F10). It renders nothing for an anonymous session. The
`/account` screens of `identity-and-profiles` later add their entry to the menu.

### C7. Test support

[`test/sdk-mock.ts`](../../../apps/client-web/test/sdk-mock.ts) `createFakeSdk` gains
`auth` (all seven methods plus `policy`) and `me` stubs. Its `setup.state` stub
returns `{ open: true }` while the real response is `{ state: … }`; it is
corrected in passing.

## 6. Tests

| Part     | Tests                                                                                                                                                                                                                                                                                                                                                         |
|----------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Server   | e2e in the identity suite: the three modes and the verification flag (flipped through the same `ConfigService` override the neighbouring specs use), anonymous access, `Cache-Control: no-store`; `IN_SCOPE_PATHS` in the OpenAPI spec.                                                                                                                       |
| SDK      | `auth.test.ts`: `policy()` GETs `/auth/policy` unauthenticated; `schemas.test.ts` for `AuthPolicySchema`.                                                                                                                                                                                                                                                     |
| kurotako | Owned by the `gen-react` feature.                                                                                                                                                                                                                                                                                                                             |
| Client   | One test file per page (states above, error table cases, each registration mode, `emailVerificationRequired` on/off on `/check-email`), `GuestOnly`, `AuthLayout`, `UserMenu` (name, sign out), the error table, `useAuthPolicy`. Updated: `login.test.tsx` (rewritten), `index.test.tsx` (moved with the route), `root-ssr.test.tsx` (mirrors the new root). |

## 7. Documentation and sequencing

- New `docs/technical/web-client-auth.md`: layouts, guest-only rule, error
  mapping, generated forms. `web-client-bootstrap.md` is updated (the shell moved
  out of the root route) and `web-client-stack.md` records TanStack Form and
  `gen-react`.
- `apps/client-web/CHANGELOG.md` entry under `[Unreleased]`.
- Order: kurotako `gen-react` published, then server `GET /auth/policy`, then the
  SDK binding, then the client (layouts, then forms). The server and the SDK
  parts do not depend on kurotako and can start immediately.

## Découpage en tâches d'implémentation

Issues in [`marmotz/ekoz`](https://github.com/marmotz/ekoz/issues), label `feature:auth`, in delivery order.

| Issue                                              | Part   | Title                                                                       | Depends on              |
|----------------------------------------------------|--------|-----------------------------------------------------------------------------|-------------------------|
| [#90](https://github.com/marmotz/ekoz/issues/90)   | server | Auth server: public GET /auth/policy                                        | —                       |
| [#91](https://github.com/marmotz/ekoz/issues/91)   | sdk    | Auth SDK: auth.policy() binding                                             | #90                     |
| [#92](https://github.com/marmotz/ekoz/issues/92)   | client | Auth client: route layouts (app shell vs auth pages), GuestOnly and UI base | —                       |
| [#93](https://github.com/marmotz/ekoz/issues/93)   | client | Auth client: signed-in user menu with sign out                              | #92, #65                |
| [#94](https://github.com/marmotz/ekoz/issues/94)   | client | Auth client: generated forms wiring, password input and error mapping       | #92                     |
| [#95](https://github.com/marmotz/ekoz/issues/95)   | client | Auth client: check-email screen, resend verification and policy hook        | #91, #94                |
| [#96](https://github.com/marmotz/ekoz/issues/96)   | client | Auth client: sign-in page                                                   | #94                     |
| [#97](https://github.com/marmotz/ekoz/issues/97)   | client | Auth client: registration page (open, invite and admin modes)               | #94, #95                |
| [#98](https://github.com/marmotz/ekoz/issues/98)   | client | Auth client: email verification page                                        | #94, #95                |
| [#99](https://github.com/marmotz/ekoz/issues/99)   | client | Auth client: forgot and reset password pages                                | #94, #95                |
| [#100](https://github.com/marmotz/ekoz/issues/100) | docs   | Document the web client auth design in docs/technical/                      | #96, #97, #98, #99, #93 |

Not machine-readable: [#94](https://github.com/marmotz/ekoz/issues/94) also waits for `@kurotako/gen-react` to be
published (kurotako feature [
`generator-react`](https://github.com/marmotz/kurotako/blob/develop/backlog/features/generator-react/overview.md), whose
own tasks are not created yet). The server and SDK tasks
([#90](https://github.com/marmotz/ekoz/issues/90), [#91](https://github.com/marmotz/ekoz/issues/91)) and the layouts
([#92](https://github.com/marmotz/ekoz/issues/92)) can start immediately.
