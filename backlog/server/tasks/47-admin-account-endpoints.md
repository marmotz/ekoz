# server — admin account read endpoints and owner-triggered password reset

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#47](https://github.com/ekoz-chat/server/issues/47)

Reference: [../features/server-administration/technical.md §2](../features/server-administration/technical.md#2-server-additions).

The admin console needs to browse accounts and reset a password on an operator's
behalf; the server exposes none of this today. All three endpoints are
owner-only, read or reuse existing models, and need **no migration**.

## Verified findings

- `AdminUsersController` (`@Controller('admin/users')`, `AuthGuard, OwnerGuard`)
  today only has `POST` (create), `:id/suspend`, `:id/unsuspend`, `DELETE :id`
  — no `GET` — across
  [registration.controller.ts](../../src/modules/identity/accounts/registration.controller.ts)
  and
  [lifecycle.controller.ts](../../src/modules/identity/accounts/lifecycle.controller.ts).
- `User` carries `name`, `email`, `isOwner`, `status`, `suspendedAt`,
  `suspendedReason`, `createdAt`
  ([contract.prisma:155](../../src/core/prisma/contract.prisma)); `UserProfile`
  holds `displayName`.
- `AccountView`
  ([account.view.ts](../../src/modules/identity/accounts/account.view.ts)) is
  the existing account summary shape.
- `PasswordResetService` today exposes only `request(email, ip)`
  ([password-reset.service.ts](../../src/modules/identity/accounts/password-reset.service.ts));
  the public endpoint is `POST /auth/password-reset/request`, behind
  `SensitiveThrottleGuard` and `202`-always.

## To do

1. **`GET /admin/users`** (owner-only). New method on `AdminUsersController` or a
   dedicated `AdminUserQueryController` in the same folder.
   - Query params: `q` (substring on `name` / `email` / `displayName`),
     `status` (`active` / `suspended` / `deleted`), `owner` (`true` / `false`),
     `cursor`, `limit` (default 50, max 200). Validate with a Zod schema +
     `ZodValidationPipe`.
   - Keyset pagination on `(createdAt desc, id desc)`.
   - Response `{ items: AdminUserListItem[], nextCursor: string | null }`;
     `AdminUserListItem` = `AccountView` + `createdAt`, `suspendedAt`,
     `suspendedReason`. `email` included (owner context).
   - Join `UserProfile` for `displayName`; raw `$queryRaw` or a joined `ILIKE`
     for `q` (repo convention: raw SQL for search).
   - No audit entry (read).
2. **`GET /admin/users/:id`** (owner-only). Same item shape plus
   `emailVerifiedAt` and the active-session count
   (`Session.where(userId, revokedAt null).count()`). `404
identity.user_not_found` when absent.
3. **`POST /admin/users/:id/password-reset`** (owner-only).
   - Add `requestForUser(userId, actorUserId)` (or an internal `issueFor(user)`)
     to `PasswordResetService`, sharing the existing token store and mail
     template.
   - Not behind `SensitiveThrottleGuard`. Returns `202 { accepted: true }`.
   - `404` if the user does not exist; `409 identity.account_deleted` if
     `status = 'deleted'` or `email` is null.
   - Audit action `identity.password_reset_triggered` via `AuditService.record`
     (`actorUserId` = owner, `targetType: 'user'`, `targetId: id`).
4. **Tests** (`*.e2e-spec.ts` alongside the controller): list filters + keyset
   paging + `403` for a non-owner; detail happy path + `404`; password-reset
   `202` + mail enqueued + audit row + `404` + `409` on a deleted account.
5. **`http/` collection**: `http/admin/users-list.hurl`,
   `users-list-forbidden.hurl`, `user-get.hurl`, `user-get-not-found.hurl`,
   `user-password-reset.hurl`. Keep the layout block in
   [http/README.md](../../http/README.md) in sync.
6. **CHANGELOG.md**: one bullet per capability under `## [Unreleased]`, tagged
   with this issue.

## Dependencies

- [46-monorepo-restructure](46-monorepo-restructure.md) — land the restructure
  first; these files then live under `apps/backend/`.
