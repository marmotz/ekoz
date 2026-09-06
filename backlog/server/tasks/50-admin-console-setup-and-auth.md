# admin console — server initialization and owner sign-in

**Status**: todo
**Type**: front
**Repo**: ekoz-chat/server
**Issue**: [#50](https://github.com/ekoz-chat/server/issues/50)

Reference: [../features/server-administration/technical.md §6, §7](../features/server-administration/technical.md#6-session-owner-gate-setup-flow).

The first screens: initialize a fresh server (create the first owner) and sign
an owner in and out.

## To do

1. **`routes/index.tsx` loader** — call `sdk.setup.state()`:
   - `closed` → redirect `/login`;
   - `email-pinned` / `token-pinned` → redirect `/setup`.
2. **`routes/setup.tsx`** — owner setup form. Fields: email, password, identifier
   (`name`), display name; plus a single-use **token** field when
   `state === 'token-pinned'` (copy the hint that the token is printed in the
   server logs on every restart). Submit `sdk.setup.owner(...)` →
   `POST /setup/owner`.
   - On `201`: the SDK stores the returned session; navigate `/users`.
   - On `410 setup.closed` (race): show "already initialized" and link to
     `/login`.
   - Field-level errors from `problem+json` validation surfaced inline.
3. **`routes/login.tsx`** — identifier + password, `sdk.auth.login(...)`. On
   success navigate to the post-login target (`/users`). Handle
   `401 auth.invalid_credentials` and the suspended-account error. Link back to
   nothing (no self-service password reset in the console — owners use the
   account detail screen for other users, and the server logs / email for
   themselves).
4. **Sign out** — wire the topbar user-menu action to `sdk.auth.logout()` then
   navigate `/login`.
5. **`RequireOwner`** wraps every route except `/setup` and `/login`.
6. **i18n** — `setup` namespace (`locales/{en,fr}/setup.json`); auth strings in
   `common` or an `auth` namespace.
7. **Tests** — `index` loader branching on each setup state; setup form submits
   the right payload per mode, handles `201` / `410` / validation errors; login
   success + `401`; sign out clears the session. SDK mocked.
8. **CHANGELOG.md** — entry under `## [Unreleased]`.

## Dependencies

- [49-admin-console-bootstrap](49-admin-console-bootstrap.md)
- [48-console-reachability](48-console-reachability.md) — `GET /setup`.
- [sdk-js#11](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/tasks/11-admin-console-bindings.md) —
  `sdk.setup.state()` (setup / auth bindings otherwise from sdk-js #6/#8).
