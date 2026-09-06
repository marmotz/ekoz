# sdk-js — admin console resource bindings

**Status**: todo
**Type**: sdk
**Issue**: [#27](https://github.com/marmotz/ekoz/issues/27)

Reference:
[server-administration technical.md §8](../features/server-administration/technical.md#8-sdk-js-impact).

The reference server's admin console consumes the server only through `@ekozhq/sdk`.
#24 binds the account **mutations**
(`admin.users` create/suspend/delete, `admin.owners`, `admin.usernameRequests`,
`invitations`); this task adds the **reads**, the owner-triggered password reset,
and the setup-state probe the console also needs.

## Verified findings

Server endpoints added by
#14 and
#15:

- `GET /setup` (public) → `{ state: 'closed' | 'email-pinned' | 'token-pinned' }`.
- `GET /admin/users` (owner) → `{ items: AdminUserListItem[], nextCursor: string | null }`;
  query `q`, `status`, `owner`, `cursor`, `limit`.
- `GET /admin/users/:id` (owner) → one `AdminUserListItem` + `emailVerifiedAt`,
  active-session count.
- `POST /admin/users/:id/password-reset` (owner) → `202 { accepted: true }`.

## To do

1. `src/resources/setup.ts`: add `state()` → `GET /setup` (unauthenticated).
2. `src/resources/admin.ts`, `admin.users` sub-namespace: add
   - `list(params?)` → `GET /admin/users`, typed params + `{ items, nextCursor }`;
     a cursor iterator helper if the SDK exposes one elsewhere.
   - `get(id)` → `GET /admin/users/:id`.
   - `triggerPasswordReset(id)` → `POST /admin/users/:id/password-reset`.
3. Wire types (`AdminUserListItem`, `SetupState`) in the wire-types module,
   aligned with the targeted protocol version; a mismatch with
   `spec/docs/protocol/` is fixed in `spec`, not worked around.
4. Unit tests (mocked fetch): path/verb/query per call; `list` pagination;
   `get` 404 surfaces as `NotFoundError`; owner-scoped calls send the bearer
   token; `setup.state()` sends none.
5. README resource list updated.

## Dependencies

24-invitations-and-admin-resources (done — `tasks/done/sdk-24-invitations-and-admin-resources.md`).
Server side: #14,
#15.
