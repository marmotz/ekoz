# sdk-js — profile, account and sessions resource bindings

**Status**: todo
**Type**: sdk
**Issue**: [#7](https://github.com/ekoz-chat/sdk-js/issues/7)

Reference: [../features/sdk-foundations/technical.md §10](../features/sdk-foundations/technical.md#10-surface-publique).

## Verified findings

- `GET /me`, `PATCH /me/profile`, `PUT /me/avatar` (multipart `file`),
  `DELETE /me/avatar`
  ([profile.controller.ts:33](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/profile/profile.controller.ts#L33)).
- `POST /me/email` (`{ newEmail, password }`)
  ([email-verification.controller.ts:56](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/email-verification/email-verification.controller.ts#L56)).
- `PATCH /me/username` → `{ status: 'applied', identifier } | { status: 'pending', requestId }`
  ([username.service.ts:15](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/accounts/username.service.ts#L15)).
- `DELETE /me` (`{ password }`)
  ([lifecycle.controller.ts:73](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/accounts/lifecycle.controller.ts#L73)).
- `GET /users/:identifier` → `PublicProfileView`
  ([profile.controller.ts:75](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/profile/profile.controller.ts#L75)).
- `GET /sessions`, `PATCH /sessions/:id`, `DELETE /sessions/:id`,
  `DELETE /sessions?all=true` → `{ revoked }`
  ([sessions.controller.ts:19](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/auth/sessions.controller.ts#L19)).

## To do

1. `src/resources/me.ts`: `get()`, `updateProfile({ displayName?, bio? })`,
   `setAvatar(file: Blob | File)` (builds the `FormData`), `deleteAvatar()`,
   `changeEmail({ newEmail, password })`, `changeUsername({ name })` (returns the
   discriminated outcome), `deleteAccount({ password })` — on success, clear the
   session.
2. `src/resources/users.ts`: `getProfile(identifier)`.
3. `src/resources/sessions.ts`: `list()`, `rename(id, { deviceName })`,
   `revoke(id)`, `revokeAllOthers()`.
4. Unit tests (mocked fetch): path/verb/body per call; avatar `FormData` field
   name is `file` and no explicit `Content-Type`; username outcome both branches;
   `deleteAccount` clears the store.

## Dependencies

[5-client-assembly-and-wire-types](5-client-assembly-and-wire-types.md), [6-auth-and-setup-resources](6-auth-and-setup-resources.md).
