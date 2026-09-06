# admin console — account administration

**Status**: todo
**Type**: front
**Repo**: ekoz-chat/server
**Issue**: [#51](https://github.com/ekoz-chat/server/issues/51)

Reference: [../features/server-administration/technical.md §7](../features/server-administration/technical.md#7-screen--endpoint-map).

The account screens: list, detail with lifecycle actions, and creation.

## To do

1. **`routes/users/index.tsx`** — account list. `sdk.admin.users.list(...)`.
   - Search box (`q`), status filter (`active` / `suspended` / `deleted`),
     owner-only toggle. "Load more" via `nextCursor`.
   - Columns: display name + identifier, email, status badge, owner badge,
     created date. Row → `/users/$userId`.
2. **`routes/users/$userId.tsx`** — account detail from `sdk.admin.users.get(id)`
   (display name, identifier, email + verified, status, owner, created,
   active-session count). Actions, each with a confirm dialog and a toast, then
   query invalidation:
   - Suspend (reason field) / unsuspend →
     `POST /admin/users/:id/suspend|unsuspend`.
   - Delete → `DELETE /admin/users/:id`.
   - Trigger password reset → `sdk.admin.users.triggerPasswordReset(id)`.
   - Grant owner / revoke owner → `POST /admin/owners` /
     `DELETE /admin/owners/:userId`; hide "revoke" when it is the last owner and
     surface the server's `409` if it slips through.
   - Guard the actions that do not apply to a `deleted` account.
3. **`routes/users/new.tsx`** — create account form (email, identifier, display
   name, password or "send setup mail" per what `POST /admin/users` accepts —
   confirm against `AdminCreateUserSchema`). On success navigate to the new
   detail page.
4. **Nav** — register a "Users" sidebar entry via `registerNav()`.
5. **i18n** — `users` namespace (`locales/{en,fr}/users.json`).
6. **Tests** — list renders / filters / paginates; detail actions call the right
   SDK method and invalidate; last-owner revoke hidden; create submits the right
   payload. SDK mocked.
7. **CHANGELOG.md** — entry under `## [Unreleased]`.

## Dependencies

- [49-admin-console-bootstrap](49-admin-console-bootstrap.md)
- [47-admin-account-endpoints](47-admin-account-endpoints.md) — the read +
  reset endpoints.
- [sdk-js#11](https://github.com/ekoz-chat/sdk-js/blob/main/backlog/tasks/11-admin-console-bindings.md)
