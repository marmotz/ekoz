# Web client authentication

## Context

The [web client bootstrap](web-client-bootstrap.md) wired the session
(`SdkProvider`, `useSession()`, `RequireAuth`, `SessionGuard`) but shipped only a
placeholder `/login`, and every route was rendered inside the full application
shell, so an anonymous visitor would have seen a sidebar on the sign-in page.
The `auth` feature adds the anonymous flows of `apps/client-web`: sign in,
registration (open, invite and admin modes), email verification, forgotten and
reset password, and the signed-in user menu with sign out.

Three constraints shaped it:

- The server fixes the mail link paths and parameters (`/verify-email?token=`,
  `/reset-password?token=`, `/register?invite=`, built from `server.web_url`).
- The registration mode, whether an email must be verified and the minimum
  password length are runtime server settings, read from the public
  [`GET /auth/policy`](auth-policy-endpoint.md).
- The request bodies are already described as Zod schemas in the OpenAPI
  pipeline ([OpenAPI description and SDK types](openapi-description-and-sdk-types.md));
  the forms should not restate them by hand.

The feature-level design is in
[`backlog/features/auth/technical.md`](../../backlog/features/auth/technical.md);
this page records what shipped and why.

## Decision

### Route layouts: `_app` and `_auth`

The root route (`routes/__root.tsx`) renders only the document, the providers,
the `Toaster` and an `<Outlet />`. Two pathless layout routes choose the frame:

| Layout | Renders | Children |
| ------ | ------- | -------- |
| `routes/_app.tsx` | `AppFrame` (sidebar, top bar) with `<UserMenu />` in the top bar `user-menu` slot | `routes/_app/**`: the home page and every later page of the application |
| `routes/_auth.tsx` | `AuthLayout` (`features/auth/components`): a centered card with the language switcher and the theme toggle, no sidebar | `routes/_auth/{login,register,check-email,forgot-password,verify-email,reset-password}.tsx` |

Both layouts live in `routes` because `app` may not import a feature while
`routes` may (see the boundaries table in
[web client bootstrap](web-client-bootstrap.md)). Route files stay thin:
`createFileRoute`, `staticData.title`, `validateSearch` for `token` / `invite`
(typed, non-empty strings; anything else is dropped) and the page component
from `features/auth/routes`.

### Guest-only pages and the mail-link exception

`GuestOnly` wraps `/login`, `/register`, `/check-email` and `/forgot-password`.
It follows `useSession()`: `unknown` shows a skeleton, `authenticated` navigates
to `/` with `replace`, `anonymous` renders the page.

It is also what completes a sign-in. `LoginPage` never navigates on success:
`sdk.auth.login()` establishes the session, `session:authenticated` flips the
status, and `GuestOnly` redirects. Sign out is symmetric: `UserMenu` only calls
`sdk.auth.logout()`, the SDK emits `session:invalid` and `SessionGuard` clears
the query cache and navigates to `/login`. One mechanism per transition.

`/verify-email` and `/reset-password` are **not** guest-only. They are reached
from a mail link carrying a single-use token; a user who happens to be signed in
in that browser must not be redirected away and lose the token.

The destination after sign-in is always `/`. Carrying the originally requested
path is deferred until a protected deep link exists.

### Server policy and the check-email adaptation

`useAuthPolicy()` reads `GET /auth/policy` through TanStack Query (key
`['auth', 'policy']`, `staleTime: 0` so a hot-reloaded setting shows on the next
visit rather than after the global 30 s). `PolicyGate` renders a skeleton while
it loads and an error with a retry if it fails, so pages consume a resolved
policy.

- `/register` renders from `registrationMode`: `admin` shows the "registration
  closed" message and no form; `invite` adds a required invitation field
  pre-filled from `?invite=`; `open` has none. The password minimum comes from
  `passwordMinLength`.
- `/check-email` follows `emailVerificationRequired`. When it is `true`, the
  screen says "check your mailbox" and offers a resend (`resendVerification`,
  always reported as accepted so it reveals nothing). When it is `false`, the
  server created the account already verified and sent no mail, so the screen
  says "account created, you can sign in" with a link to `/login` and no resend.
- The email reaches `/check-email` in the router history `state`, never in the
  URL; after a reload the state is gone and the resend form asks for it.

### Error mapping by code

SDK errors are mapped by their stable `code`, not by SDK error class, in one
table (`features/auth/api/errors.ts`): not every code has a dedicated class
(`identity.identifier_invalid` surfaces as a plain `EkozError`). Each code is
placed either on the form as a whole or on a named request-body field:

| Code | Placement |
| ---- | --------- |
| `auth.invalid_credentials`, `identity.account_suspended` | form (the credentials message never says which part was wrong) |
| `identity.email_not_verified` | form, plus a link to `/check-email` on the sign-in page |
| `identity.registration_closed` | form; the register page switches to the closed message and refetches the policy |
| `identity.invitation_invalid` | `invitationToken` field |
| `identity.email_taken` | `email` field |
| `identity.identifier_invalid` | `name` field |
| `identity.password_too_weak` | `password` field |
| `identity.email_verification_invalid`, `auth.password_reset_invalid` | page-level message (with a resend form, or a link to `/forgot-password`) |
| `auth.too_many_requests` (`RateLimitError`) | form, with the `retryAfter` seconds when known |
| `ValidationError` with `issues` | per field, by `path` |
| `NetworkError`, anything else | generic form message |

`useAuthError({ fields })` turns a mapped error into translated form and field
messages. A field error for a field the form does not render falls back to the
form message, so a table entry never gets lost on a page that lacks the field.
The hook also exposes the `code`, which is how pages react to
`identity.email_not_verified` and `identity.registration_closed`. Client-side
Zod issues are translated by `validationMessage()` rather than showing Zod's
English text.

### Generated forms on TanStack Form

The form state is generated, not hand-written. kurotako's
`@kurotako/gen-react-tanstack` generator emits, for each request body listed in
`tako.config.ts` (`LoginDto`, `RegisterDto`, `ResendVerificationDto`,
`RequestPasswordResetDto`, `ConfirmPasswordResetDto`), a headless hook such as
`useLoginDtoForm()` on **TanStack Form**: typed default values, validation by
the generated Zod schema (on submit, then on change), per-field state and
submit. The output lands in `apps/client-web/src/generated` (marked
`linguist-generated`) and is imported through the `api/*` path alias.

- No JSX is generated. Fields are hand-written in `features/auth` with shadcn/ui
  components (`AuthTextField`, `PasswordInput` with show/hide) and i18n labels.
- A page may pass its own `schema` to adapt the generated one at runtime:
  `RegisterDtoSchema.extend(...)` applies `passwordMinLength` from the policy
  and makes `invitationToken` required only in `invite` mode;
  `LoginDtoSchema.omit({ deviceName: true })` drops the device name, which the
  server derives from the User-Agent.
- The generator runs its own copy of the Zod generator next to the hooks rather
  than importing the SDK's schemas: the SDK re-exports them under wire names
  (`LoginBodySchema`) a generic generator cannot guess. The output is
  duplicated, the source (`openapi.json`) is not.
- Submitting still goes through `@ekozhq/sdk` (one `useMutation` hook per SDK
  call in `features/auth/api`); the generated hooks hold form state only.

## Alternatives

| Topic | Chosen | Rejected | Why |
| ----- | ------ | -------- | --- |
| Shell vs auth pages | Two pathless layouts under `routes` | Conditional shell in `__root.tsx`, or in `AppFrame` | A pathless layout is the router's own tool for it; `app` cannot import the `auth` feature that fills the user menu. |
| Completing sign-in | `GuestOnly` reacts to the session | `navigate('/')` in the login handler | A single mechanism; no race between the navigation and `session:authenticated`. |
| Mail-link pages | Reachable while signed in | Guest-only like the others | The token is single-use; a redirect would waste it. |
| Registration and verification policy | Read from `GET /auth/policy` | Try and read the error; build-time config | Cannot show the right form or the password length beforehand; the settings are hot-reloadable. |
| Error mapping | One table keyed by `code` | `instanceof` per SDK class; per-page handling | Some codes have no class; one table keeps placements consistent and testable. |
| Email to `/check-email` | Router history `state` | `?email=` query parameter | Keeps the address out of the URL, logs and history. |
| Forms | Generated TanStack Form hooks | Hand-written forms; React Hook Form | The DTO schemas already exist; TanStack Form matches the Start / Router / Query stack. |
| Generated JSX | None (headless hooks) | Generated field components | Fields need shadcn/ui, i18n and per-page layout; generated markup would be overridden everywhere. |

## Consequences

- Every page that needs the shell lives under `routes/_app/`; a page added at the
  top level of `routes` renders without sidebar or top bar. Protected pages still
  wrap their component in `RequireAuth` (no page does yet).
- The sign-in and registration pages wait for one extra round trip
  (`GET /auth/policy`) on the pages that need it, and show a retry if the server
  is unreachable.
- A new server error code shown by an auth form needs a row in the error table
  and a key in both `auth.errors.*` catalogues; an unmapped code degrades to the
  generic message.
- A new auth form needs its DTO in `CLIENT_WEB_FORMS` in `tako.config.ts` and a
  `bun run generate`; `bun run check` fails in CI when the generated output
  drifts from `openapi.json`.
- `tako.config.ts` wraps the generator's private Zod pass to work around a
  `@kurotako/gen-zod` import bug; the wrapper goes away once kurotako fixes it.
