# sdk-js — invitations and admin resource bindings

**Status**: todo
**Type**: sdk
**Issue**: [#8](https://github.com/ekoz-chat/sdk-js/issues/8)

Reference: [../features/sdk-foundations/technical.md §10](../features/sdk-foundations/technical.md#10-surface-publique).

## Verified findings

- `POST /invitations` (owner) → `{ id, token, url, expiresAt }`, `GET /invitations`,
  `DELETE /invitations/:id`
  ([invitations.controller.ts:22](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/invitations/invitations.controller.ts#L22)).
- `POST /admin/users` (owner) → `AccountView`
  ([registration.controller.ts:49](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/accounts/registration.controller.ts#L49)).
- `POST /admin/users/:id/suspend` (`{ reason }`), `/unsuspend`, `DELETE /admin/users/:id`
  ([lifecycle.controller.ts:22](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/accounts/lifecycle.controller.ts#L22)).
- `POST /admin/owners` (`{ userId }`), `DELETE /admin/owners/:userId`
  ([lifecycle.controller.ts:51](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/accounts/lifecycle.controller.ts#L51)).
- `GET /admin/username-requests?status=`, `POST /admin/username-requests/:id/approve`
  → `{ identifier }`, `POST /admin/username-requests/:id/reject`
  ([username.controller.ts:32](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/accounts/username.controller.ts#L32)).

## To do

1. `src/resources/invitations.ts`: `create({ email?, expiresInDays? })`,
   `list()`, `revoke(id)`.
2. `src/resources/admin.ts` with sub-namespaces:
   - `admin.users`: `create(body)`, `suspend(id, { reason })`, `unsuspend(id)`,
     `delete(id)`.
   - `admin.owners`: `add({ userId })`, `remove(userId)`.
   - `admin.usernameRequests`: `list(status?)`, `approve(id)`, `reject(id)`.
3. Unit tests (mocked fetch): path/verb/body per call; `identity.last_owner`
   surfaces as `LastOwnerError`; owner-scoped calls still send the bearer token.

## Dependencies

[5-client-assembly-and-wire-types](5-client-assembly-and-wire-types.md), [6-auth-and-setup-resources](6-auth-and-setup-resources.md).
