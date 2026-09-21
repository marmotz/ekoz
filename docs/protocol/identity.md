# Identity and profiles

Setup, credentials, sessions, profiles and owner administration. This is the
wire contract the SDK's identity resources bind against (see the
[SDK foundations technical design](../../backlog/_archives/features/sdk-foundations/technical.md)
§10–§11); a mismatch between this page and `apps/server` is a bug, fixed here
first (see [HTTP API conventions](../technical/api-conventions.md)).

## Conventions

- Every request from an SDK build carries `X-Ekoz-Protocol: <major>` naming
  the protocol major it targets (see [README](README.md#principles) and the
  [SDK packaging and protocol-version policy](../technical/sdk-packaging-and-protocol-policy.md)).
  Ignored by the server today; a tolerant reader lands with a separate
  `server` task.
- Error responses are `application/problem+json` with a stable `code`
  (see [HTTP API conventions](../technical/api-conventions.md)). This surface
  uses two namespaces: `auth.*` for tokens, sessions and credentials,
  `identity.*` for accounts, profiles and identifiers.
- Timestamps: UTC ISO-8601. Identifiers: ULID, except the user-facing
  identifier which is `name/server` (see [user identifier](../technical/user-identifier.md)).
- Sensitive endpoints (`login`, `register`, `verify-email/resend`,
  `password-reset/request`) are additionally rate-limited; a throttled request
  gets `auth.too_many_requests` (`429`) with `Retry-After`.

## Setup

### `POST /setup/owner`

Creates the first owner account (one-shot server initialisation). Only
reachable while server setup is open; once an owner exists the route is
`410 Gone`.

- Body: `{ email, password, name, displayName, token? }` — `token` is required
  on a token-pinned boot, ignored on an email-pinned one.
- `201`: `{ user: AccountView, accessToken, refreshToken, expiresIn, session: SessionView }`.
- Errors: `identity.setup_rejected` (`403`), validation (`422`), `410` once
  setup is closed.

## Registration

### `GET /auth/policy`

Public and unauthenticated, never cached (`Cache-Control: no-store`). Tells a
client how to present the sign-up and sign-in flows before anyone types
anything. Read live from the server settings, so a change made by the owner
shows on the next call.

- `200`: `{ registrationMode, emailVerificationRequired, passwordMinLength }`.
  - `registrationMode`: `open` | `invite` | `admin` (the current
    `registration.mode`).
  - `emailVerificationRequired`: boolean. When `false`, a registered account is
    created already verified and no verification mail is sent.
  - `passwordMinLength`: integer, the minimum length the server accepts for a
    password.

### `POST /auth/register`

- Body: `{ name, email, password, displayName, invitationToken? }`.
  `invitationToken` is required only when `registration.mode = invite`.
- `201`: `AccountView`. **No tokens** — the consumer follows up with
  `POST /auth/login`.
- Errors: `identity.registration_closed` (`403`, `registration.mode = admin`),
  `identity.email_taken` / `identity.identifier_invalid` (`409`/`422`),
  `identity.invitation_invalid` (`422`), `identity.password_too_weak` (`422`),
  `auth.too_many_requests` (`429`).

### `POST /admin/users` (owner)

Owner-created account, used when `registration.mode = admin`.

- Body: `{ name, email, password, displayName, isOwner? }`.
- `201`: `AccountView`.
- Errors: `identity.email_taken` / `identity.identifier_invalid`,
  `identity.password_too_weak`.

## Credentials and sessions

### `POST /auth/login`

- Body: `{ identifier, password, deviceName? }`.
- `200`: `{ accessToken, refreshToken, expiresIn, session: SessionView }`.
- Errors: `auth.invalid_credentials` (`401`) — identifier not found and wrong
  password both map here, so the response never discloses which; wrong
  password does not trigger a refresh attempt client-side.
  `identity.account_suspended` (`403`), `identity.email_not_verified` (`403`
  when email verification is required), `auth.too_many_requests` (`429`).

### `POST /auth/refresh`

- Body: `{ refreshToken }`.
- `200`: `{ accessToken, refreshToken, expiresIn }` — the refresh token
  rotates on every call; it is single-use.
- Errors: `auth.refresh_invalid` (`401`, expired/unknown token),
  `auth.refresh_reuse` (`401`, a consumed refresh token was replayed — the
  whole session is revoked server-side).

### `POST /auth/logout`

Authenticated. Revokes the calling session. `204`.

### `GET /sessions`

Authenticated. `200`: `SessionView[]` for the calling account.

### `PATCH /sessions/:id`

Authenticated, scoped to the caller.

- Body: `{ deviceName }`.
- `200`: `SessionView`.
- Errors: `identity.session_not_found` (`404`, wrong owner or unknown id).

### `DELETE /sessions/:id`

Authenticated, scoped to the caller. `204`. Errors:
`identity.session_not_found` (`404`).

### `DELETE /sessions?all=true`

Authenticated. Revokes every session for the caller except the current one.

- `200`: `{ revoked: number }`.
- Errors: `400` if `all=true` is missing.

### `SessionView`

| Field         | Type           | Notes                                       |
| ------------- | -------------- | -------------------------------------------- |
| `id`          | string (ULID)  |                                               |
| `deviceName`  | string         |                                               |
| `current`     | boolean        | `true` for the session the access token belongs to. |
| `ip`          | string \| null |                                               |
| `createdAt`   | string (ISO)   |                                               |
| `lastSeenAt`  | string (ISO)   |                                               |
| `revokedAt`   | string \| null (ISO) |                                        |

## Email verification and password reset

### `POST /auth/verify-email`

- Body: `{ token }`. `200`: `{ verified: true }`.
- Errors: `identity.email_verification_invalid` (`422`).

### `POST /auth/verify-email/resend`

- Body: `{ email }`. `202`: `{ accepted: true }` — always, regardless of
  whether the address exists.
- Errors: `auth.too_many_requests` (`429`).

### `POST /me/email` (authenticated)

Requests an email-address change; applies once its verification token is
consumed.

- Body: `{ newEmail, password }`. `202`: `{ accepted: true }`.
- Errors: `identity.email_taken` (`409`), `auth.invalid_credentials` (`403`,
  wrong password).

### `POST /auth/password-reset/request`

- Body: `{ email }`. `202`: `{ accepted: true }` — always accepted.
- Errors: `auth.too_many_requests` (`429`).

### `POST /auth/password-reset/confirm`

- Body: `{ token, newPassword }`. `204` — revokes every session for the
  account.
- Errors: `auth.password_reset_invalid` (`422`).

## Own profile (authenticated, `/me`)

### `GET /me`

`200`: `MeView` — `AccountView` extended with `bio: string | null` and
`avatarUrl: string | null`.

### `PATCH /me/profile`

- Body: `{ displayName?, bio? }` — at least one field; `bio: null` clears it.
- `200`: `MeView`.
- Errors: validation (`422`).

### `PUT /me/avatar`

Multipart, field `file`. Real image type sniffed server-side.

- `200`: `{ avatarUrl: string }`.
- Errors: `identity.avatar_rejected` (`422`), `identity.avatar_too_large` (`413`).

### `DELETE /me/avatar`

`204`.

### `PATCH /me/username`

Policy-driven identifier change (`identity.username_change_policy`:
`immutable` | `available` | `approval`).

- Body: `{ name }`.
- `200`: `{ status: 'applied', identifier }` or `{ status: 'pending', requestId }`.
- Errors: `identity.username_immutable` (`403`),
  `identity.username_taken` (`409`), `identity.username_change_cooldown` (`409`).

### `DELETE /me`

Self-service deletion; re-authenticates.

- Body: `{ password }`. `204`.
- Errors: `auth.invalid_credentials` (`403`), `identity.last_owner` (`409`,
  the sole remaining owner cannot delete their own account).

### `AccountView`

| Field          | Type            | Notes                                   |
| -------------- | --------------- | ---------------------------------------- |
| `id`           | string (ULID)   |                                           |
| `identifier`   | string \| null  | `name/server`; `null` once deleted.      |
| `email`        | string \| null  |                                           |
| `displayName`  | string          |                                           |
| `isOwner`      | boolean         |                                           |
| `emailVerified`| boolean         |                                           |
| `status`       | `active` \| `suspended` \| `deleted` |                     |

## Public profiles

### `GET /users/:identifier`

Authenticated (the profile itself is public; the endpoint is not anonymous).

- `200`: `{ identifier, displayName, bio: string | null, avatarUrl: string | null }`.
- Errors: `identity.profile_not_found` (`404`).

## Invitations (owner)

### `POST /invitations`

- Body: `{ email?, expiresInDays? }`.
- `201`: `{ id, token, url }` — the plaintext token is returned once only.

### `GET /invitations`

`200`: `InvitationView[]` — never exposes the token.

### `DELETE /invitations/:id`

`204`. Errors: `identity.invitation_not_found` (`404`).

### `InvitationView`

| Field              | Type                                       |
| ------------------ | ------------------------------------------- |
| `id`                | string (ULID)                              |
| `email`             | string \| null                             |
| `createdByUserId`   | string (ULID)                              |
| `createdAt`         | string (ISO)                               |
| `expiresAt`         | string (ISO)                               |
| `consumedAt`        | string \| null (ISO)                       |
| `consumedByUserId`  | string \| null (ULID)                      |
| `status`            | `pending` \| `accepted` \| `revoked` \| `expired` |

## Owner administration (`/admin/*`, owner-only)

### `POST /admin/users/:id/suspend`

Body: `{ reason }`. `204`. Errors: `identity.user_not_found` (`404`).

### `POST /admin/users/:id/unsuspend`

`204`. Errors: `identity.user_not_found` (`404`).

### `DELETE /admin/users/:id`

`204`. Errors: `identity.user_not_found` (`404`), `identity.last_owner` (`409`).

### `POST /admin/owners`

Body: `{ userId }`. `204`. Errors: `identity.user_not_found` (`404`).

### `DELETE /admin/owners/:userId`

`204`. Errors: `identity.user_not_found` (`404`),
`identity.last_owner` (`409`, refuses to remove the sole remaining owner).

### `GET /admin/username-requests?status=`

`status`: `pending` | `approved` | `rejected` (optional). `200`:
`UsernameChangeRequest[]`.

### `POST /admin/username-requests/:id/approve`

`200`: `{ identifier }`. Errors: `identity.username_request_not_found` (`404`),
`identity.username_request_resolved` (`409`), `identity.username_taken`
(`409`, re-checked at decision time).

### `POST /admin/username-requests/:id/reject`

`204`. Errors: `identity.username_request_not_found` (`404`),
`identity.username_request_resolved` (`409`).

### `UsernameChangeRequest`

| Field             | Type                                  |
| ----------------- | -------------------------------------- |
| `id`               | string (ULID)                        |
| `userId`           | string (ULID)                        |
| `requestedName`    | string                               |
| `status`           | `pending` \| `approved` \| `rejected` |
| `createdAt`        | string (ISO)                         |
| `resolvedAt`       | string \| null (ISO)                 |
| `resolvedByUserId` | string \| null (ULID)                |

## Error codes reference

| Code                                       | Status | Meaning                                              |
| ------------------------------------------- | ------ | ----------------------------------------------------- |
| `auth.invalid_credentials`                  | 401    | Wrong identifier/password. Never triggers a refresh.  |
| `auth.unauthenticated`                      | 401    | Missing/expired access token — triggers a refresh.    |
| `auth.refresh_invalid`                      | 401    | Refresh token unknown or expired.                     |
| `auth.refresh_reuse`                        | 401    | A consumed refresh token was replayed; session revoked.|
| `auth.forbidden`                            | 403    | Authenticated but not permitted.                       |
| `auth.password_reset_invalid`               | 422    | Reset token invalid/expired.                            |
| `auth.too_many_requests`                    | 429    | Rate-limited; see `Retry-After`.                        |
| `identity.identifier_invalid`               | 422    | `name` fails identifier rules.                          |
| `identity.username_taken`                   | 409    | Identifier already in use.                              |
| `identity.username_immutable`               | 403    | `username_change_policy = immutable`.                   |
| `identity.username_change_cooldown`         | 409    | Too soon after a previous change.                       |
| `identity.username_request_not_found`       | 404    |                                                          |
| `identity.username_request_resolved`        | 409    | Already approved/rejected.                              |
| `identity.account_suspended`                | 403    | Server has revoked every session.                       |
| `identity.email_not_verified`               | 403    | Login blocked pending verification.                     |
| `identity.email_verification_invalid`       | 422    |                                                          |
| `identity.email_taken`                      | 409    |                                                          |
| `identity.password_too_weak`                | 422    |                                                          |
| `identity.registration_closed`              | 403    | `registration.mode = admin`.                            |
| `identity.invitation_invalid`               | 422    |                                                          |
| `identity.invitation_not_found`             | 404    |                                                          |
| `identity.setup_rejected`                   | 403    | Wrong pinning value at setup.                           |
| `identity.session_not_found`                | 404    | Unknown session or not owned by the caller.             |
| `identity.user_not_found`                   | 404    |                                                          |
| `identity.profile_not_found`                | 404    |                                                          |
| `identity.profile_invalid`                  | 422    |                                                          |
| `identity.avatar_rejected`                  | 422    | Not a supported image type.                             |
| `identity.avatar_too_large`                 | 413    |                                                          |
| `identity.avatar_not_found`                 | 404    |                                                          |
| `identity.last_owner`                       | 409    | Refuses to remove/delete the sole remaining owner.      |
