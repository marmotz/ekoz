# Identity and profiles — technical design

Technical design for local accounts, authentication, sessions and profiles.
Builds on [server core](../server-core/technical.md); the `server` repository is
greenfield, so this document defines the initial module rather than referencing
existing code.

Related: [user identifier](../../../../docs/technical/user-identifier.md),
[auth-and-sessions](../../../../docs/technical/auth-and-sessions.md),
[server-initialization](../../../../docs/technical/server-initialization.md),
[api-conventions](../../../../docs/technical/api-conventions.md).

**Reading guide.** §1 to §20 describe the server identity layer as first shipped;
they are kept as written because code comments cite them by number (for example
"technical.md §13"), so they are not renumbered. §21 to §28 revise the design for
the client scope decided in the [overview](overview.md): the gaps closed in
`apps/server`, their bindings in `packages/sdk`, and the account screens in
`apps/client-web`.

## 1. Scope and dependencies

In scope for the first increment:

- accounts: identifier `name/server`, email, password (Argon2id);
- registration in the three modes (`open` / `invite` / `admin`) + invitations
  (owners only);
- email verification (toggleable) and password reset — both use the server-core
  `Mailer` (SMTP);
- login, access token (JWT) + rotating opaque refresh token, reuse detection;
- named multi-device sessions: list, rename, revoke, revoke-all;
- SSE stream ticket endpoint (the stream consumer itself ships with
  [conversations](../conversations/overview.md));
- profile: display name, short bio, avatar (via server-core `BlobService`);
- identifier change driven by the `identity.username_change_policy`;
- account suspension (blocks all access), account deletion + anonymisation;
- multiple server owners (promote / demote, never below one).

Depends on server-core: `ConfigService`, `PrismaService`, `SigningService`,
`BlobService`, `Mailer`, `AuditService`, the `is_owner` bootstrap seed, and the
problem+json / request-context / ULID id conventions.

Out of scope: MFA, external identity providers, per-room permissions (see
conversations), the full admin UI (see server administration).

## 2. Module layout

```
src/modules/identity/
  identity.module.ts
  accounts/            # User, registration, deletion, suspension, owners
  auth/                # login, tokens, refresh, sessions, stream ticket
  email-verification/
  password-reset/
  invitations/
  profiles/            # profile read/update, avatar
  usernames/           # change policy, change requests, reservations
  guards/              # AuthGuard, OwnerGuard, @Public, @RequireVerifiedEmail
  identity.errors.ts   # problem+json codes namespaced `identity.*` / `auth.*`
```

## 3. Configuration parameters added

All `runtime` (see server-core registry):

| key                                 | default                      | notes                                     |
| ----------------------------------- | ---------------------------- | ----------------------------------------- |
| `auth.access_token_ttl`             | `15m`                        | JWT lifetime                              |
| `auth.refresh_token_ttl`            | `30d`                        | refresh token lifetime (absolute)         |
| `auth.max_sessions_per_user`        | `20`                         | oldest session evicted past this          |
| `auth.sensitive_throttle`           | `{ window: "15m", max: 10 }` | see §14                                   |
| `auth.stream_ticket_ttl`            | `30s`                        | SSE stream ticket validity (§12)          |
| `invitation.ttl`                    | `7d`                         | invitation validity                       |
| `identity.username_release_delay`   | `30d`                        | grace before a freed `name` can be reused |
| `identity.username_change_cooldown` | `30d`                        | min delay between self-service changes    |
| `identity.reserved_usernames`       | `[]`                         | never assignable                          |
| `profile.bio_max_length`            | `500`                        | (declared in server-core)                 |
| `avatar.max_size_bytes`             | `2_000_000`                  | (declared in server-core)                 |
| `avatar.allowed_mime`               | png/jpeg/webp/gif            | (declared in server-core)                 |

## 4. Data model (Prisma slice)

```prisma
enum UserStatus { active suspended deleted }
enum UsernameChangePolicy { immutable available approval }
enum UsernameChangeStatus { pending approved rejected }

model User {
  id              String     @id @default(ulid())
  name            String?    @unique            // null once deleted
  email           String?    @unique            // citext; null once deleted
  emailVerifiedAt DateTime?
  passwordHash    String
  isOwner         Boolean    @default(false)
  status          UserStatus @default(active)
  suspendedAt     DateTime?
  suspendedReason String?
  deletedAt       DateTime?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt

  profile               UserProfile?
  sessions              Session[]
  invitationsCreated    Invitation[]           @relation("invited_by")

  @@map("user")
}

model UserProfile {
  userId       String   @id
  displayName  String
  bio          String?
  avatarBlobId String?
  updatedAt    DateTime @updatedAt
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("user_profile")
}

model Session {
  id           String    @id @default(ulid())
  userId       String
  deviceName   String
  userAgent    String?
  ip           String?
  createdAt    DateTime  @default(now())
  lastSeenAt   DateTime  @default(now())
  revokedAt    DateTime?
  revokedReason String?
  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  refreshTokens RefreshToken[]
  @@index([userId])
  @@map("session")
}

model RefreshToken {
  id           String    @id @default(ulid())
  sessionId    String
  tokenHash    String    @unique             // sha-256 of the opaque token
  createdAt    DateTime  @default(now())
  expiresAt    DateTime
  usedAt       DateTime?
  replacedById String?
  session      Session   @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  @@index([sessionId])
  @@map("refresh_token")
}

model Invitation {
  id              String    @id @default(ulid())
  email           String?                       // null = link works for any email
  tokenHash       String    @unique
  createdByUserId String
  createdAt       DateTime  @default(now())
  expiresAt       DateTime
  consumedAt      DateTime?
  consumedByUserId String?
  createdBy       User      @relation("invited_by", fields: [createdByUserId], references: [id])
  @@map("invitation")
}

model EmailVerification {
  id         String    @id @default(ulid())
  userId     String
  email      String                            // address being verified
  tokenHash  String    @unique
  createdAt  DateTime  @default(now())
  expiresAt  DateTime
  consumedAt DateTime?
  @@index([userId])
  @@map("email_verification")
}

model PasswordReset {
  id           String    @id @default(ulid())
  userId       String
  tokenHash    String    @unique
  requestedIp  String?
  createdAt    DateTime  @default(now())
  expiresAt    DateTime
  consumedAt   DateTime?
  @@index([userId])
  @@map("password_reset")
}

model UsernameChangeRequest {
  id             String               @id @default(ulid())
  userId         String
  requestedName  String
  status         UsernameChangeStatus @default(pending)
  createdAt      DateTime             @default(now())
  resolvedAt     DateTime?
  resolvedByUserId String?
  @@index([status])
  @@map("username_change_request")
}

model ReservedUsername {
  name          String   @id
  reservedUntil DateTime
  reason        String                          // account_deleted | username_changed | manual
  createdAt     DateTime @default(now())
  @@index([reservedUntil])
  @@map("reserved_username")
}
```

`email` and `name` are both normalised (NFC, trim, lowercase) before insert and
stored as plain unique `text` — no `citext` extension
([identity account and token mechanics](../../../../docs/technical/identity-account-and-token-mechanics.md)).

## 5. Identifier rules

- Normalisation: trim, NFC, lowercase.
- Regex: `^[a-z0-9](?:[a-z0-9_.-]{0,62}[a-z0-9])?$` — 1–64 chars, no leading or
  trailing `_ . -`, no spaces.
- Rejected if in `identity.reserved_usernames`.
- **Availability** = not held by an `active`/`suspended` `User.name` **and** not
  in `reserved_username` with `reservedUntil > now()`.
- The canonical stored/returned form is `name`; the API always presents the full
  `name/server` (built from `server.domain`) and the UI prefixes `@`.
- Historical references (mentions, `room_events.sender`, message authorship) use
  the immutable `User.id`. Display name and identifier are resolved at read time,
  so a `name` change never rewrites history.

## 6. Password hashing

- Argon2id via `@node-rs/argon2` (native, runs under Bun). Parameters:
  `memoryCost = 19456` KiB, `timeCost = 2`, `parallelism = 1` (OWASP baseline),
  stored in the PHC string.
- On successful login, if the stored parameters differ from the current policy,
  rehash and update.
- Login always performs one Argon2 verification even when the user is not found
  (dummy hash) to avoid a timing oracle.

## 7. Tokens

### Access token (JWT, EdDSA)

- Signed with the active server Ed25519 key (`SigningService`), `alg = EdDSA`.
- Claims: `iss = server.domain`, `sub = userId`, `sid = sessionId`,
  `iat`, `exp` (`auth.access_token_ttl`).
- Verified by `AuthGuard`: signature, `exp`, `iss`, then:
  - session exists and `revokedAt is null` (checked against an in-memory
    **revoked-`sid` denylist** refreshed from the DB; entries kept for
    `access_token_ttl`);
  - `user.status = active`.

### Refresh token (opaque, rotating)

- 32 random bytes, base64url. Returned to the client once; only its SHA-256 hash
  is stored (`refresh_token.tokenHash`).
- One usable refresh token per session at a time.
- `POST /auth/refresh` `{ refreshToken }`:
  - look up by hash; if absent or `expiresAt < now` → `401 auth.refresh_invalid`;
  - if `usedAt` is already set → **reuse detected**: revoke the whole session and
    all its refresh tokens, `audit_log("auth.refresh_reuse_detected")`, return
    `401 auth.refresh_reuse`;
  - else: set `usedAt`, create a new refresh token (`replacedById` link), issue a
    new access token, bump `session.lastSeenAt`, return both.

### Logout

- `POST /auth/logout` revokes the current session (`revokedAt`), the refresh
  token becomes unusable, the `sid` is added to the denylist.

## 8. Registration

`POST /auth/register`:

| mode     | behaviour                                                                                                      |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| `open`   | body `{ name, email, password, displayName }`                                                                  |
| `invite` | body also `{ invitationToken }`; token must be unconsumed, unexpired, and if email-bound must match `email`    |
| `admin`  | endpoint returns `403 identity.registration_closed`; accounts are created via `POST /admin/users` (owner only) |

Common:

- validate identifier (§5) and availability; validate email format; validate
  password against a minimal policy (length ≥ 10, not in a small common-password
  list).
- create `User` (`isOwner = false`) + `UserProfile` in one transaction; mark the
  invitation consumed if present.
- if `email.verification_required` → `emailVerifiedAt = null`, create an
  `EmailVerification`, send the `email-verification` mail; **login is blocked
  until verified**.
- else → `emailVerifiedAt = now()`.
- `audit_log("identity.account_registered")`.

### Invitations (owners only, first increment)

- `POST /invitations` `{ email?, expiresInDays? }` → `{ id, token, url }`
  (`url` = `web_url` + `/register?invite=<token>`). Only the token's hash is
  stored.
- `GET /invitations` (list, own + others for owners), `DELETE /invitations/:id`
  (revoke: set `consumedAt` with a sentinel, or delete).
- Space administrators inviting into their space is a
  [conversations](../conversations/overview.md) concern; a
  `runtime` flag to let ordinary users invite is reserved but not built now.

## 9. Email verification

- `POST /auth/verify-email` `{ token }` → consume, set `user.emailVerifiedAt`,
  `audit_log`. Idempotent-safe (already-verified → `200`).
- `POST /auth/verify-email/resend` `{ email }` → always `202` (no existence
  leak); sends only if the account exists, is `active` and unverified; throttled
  (§14).
- Email change: `POST /me/email` `{ newEmail, password }` → creates an
  `EmailVerification` for the new address; the change is applied only on
  verification; the previous address gets an `email-changed-notice`.

## 10. Password reset

- `POST /auth/password-reset/request` `{ email }` → always `202`. If the account
  exists and is `active`, create a `PasswordReset` (TTL 1 h), send the
  `password-reset` mail. Throttled per email and per IP (§14).
- `POST /auth/password-reset/confirm` `{ token, newPassword }` → validate token,
  set the new hash, **revoke all of the user's sessions**,
  `audit_log("auth.password_reset")`.

## 11. Login and sessions

`POST /auth/login` `{ identifier, password, deviceName? }`:

- `identifier` accepts `name`, `name/server`, or the email.
- resolve → verify password (§6) → check `status`
  (`suspended` → `403 identity.account_suspended`; `deleted` →
  `401 auth.invalid_credentials`) → check email verified if required
  (`403 identity.email_not_verified`).
- create `Session` (`deviceName` from body, else derived from the User-Agent),
  capture `ip` / `userAgent`; if the user is at `auth.max_sessions_per_user`,
  revoke the oldest active session first.
- return `{ accessToken, refreshToken, expiresIn, session }`.

Session management (all scoped to the caller):

- `GET /sessions` → list, current session flagged.
- `PATCH /sessions/:id` `{ deviceName }`.
- `DELETE /sessions/:id` → revoke one.
- `DELETE /sessions?all=true` → revoke all except current (or all).

## 12. SSE stream ticket

- `POST /stream/ticket` (auth) → `{ ticket, expiresIn }`. `ticket` = 32 random
  bytes, single-use, ~30 s TTL, held in an in-process store keyed by hash and
  bound to `{ userId, sessionId }` (a Redis-backed store is the multi-instance
  upgrade).
- The `GET /events?ticket=…` consumer is specified and built with
  [conversations](../conversations/overview.md); it validates the ticket, binds
  the stream to the session, and rejects if the session is revoked.

## 13. Profile and avatar

- `GET /me` → account + profile + `{ isOwner, emailVerified, status }`.
- `GET /users/:identifier` → public profile
  `{ identifier, displayName, bio, avatarUrl }` (auth required).
- `PATCH /me/profile` `{ displayName?, bio? }` — `bio` ≤ `profile.bio_max_length`.
- `PUT /me/avatar` (multipart, one file):
  - reject if size > `avatar.max_size_bytes`;
  - sniff the real type with `file-type`; reject if not in `avatar.allowed_mime`;
  - `BlobService.ingest(stream, { declaredType })`, then in one transaction:
    `retain(newBlob)`, set `profile.avatarBlobId`, `release(oldBlob)`.
- `DELETE /me/avatar` → `release` the blob, null `avatarBlobId`.
- `GET /users/:identifier/avatar` → streams the blob through the server-core
  `GET /blobs/:id` path (auth required), `ETag = blob.hash`, long cache; `404`
  if no avatar.

## 14. Abuse protection on sensitive endpoints

General rate limiting is deferred ([functional spec], no protocol change), but the
credential endpoints are abuse-prone, so this feature ships a **narrow,
self-contained throttle** — not the general framework:

- a fixed-window in-memory counter (per-instance) keyed by client IP and, where
  present, the target identifier/email;
- applied to `POST /auth/login`, `/auth/register`,
  `/auth/password-reset/request`, `/auth/verify-email/resend`;
- limits from `auth.sensitive_throttle` (`{ window, max }`); over the limit →
  `429` problem+json with `Retry-After`.

This is a deliberate, minimal exception to "rate limiting out of the first
increment"; the general policy still comes later.

## 15. Suspension, deletion, owners

### Suspension (owner action)

- `POST /admin/users/:id/suspend` `{ reason }` → `status = suspended`,
  `suspendedAt`, revoke every session, `audit_log`. Login blocked; any
  authenticated request from a suspended user → `403`.
- `POST /admin/users/:id/unsuspend` → `status = active`.

### Account deletion

- Self: `DELETE /me` `{ password }` (re-authentication).
- Owner: `DELETE /admin/users/:id`.
- Effect, one transaction:
  - `status = deleted`, `deletedAt = now()`;
  - revoke every session;
  - `UserProfile`: `displayName = "Deleted account"`, `bio = null`,
    `release(avatarBlob)`, `avatarBlobId = null`;
  - `User.name → null`, `User.email → null`;
  - insert `ReservedUsername { name, reservedUntil: now + identity.username_release_delay, reason: "account_deleted" }`;
  - `audit_log("identity.account_deleted")`.
- Forward contract for [conversations](../conversations/overview.md): message
  authorship keeps `User.id`; reads resolve a deleted user to "Deleted account".
  `room_events.sender` is unchanged.
- The last owner cannot be deleted or suspended.

### Owners

- `POST /admin/owners` `{ userId }` / `DELETE /admin/owners/:userId` (owner
  only). At least one owner must remain. `audit_log` on each change.

## 16. Endpoint summary

| Method & path                                                                          | Auth          | Purpose                            |
| -------------------------------------------------------------------------------------- | ------------- | ---------------------------------- |
| `POST /auth/register`                                                                  | public        | create an account (mode-dependent) |
| `POST /auth/login`                                                                     | public        | issue tokens + session             |
| `POST /auth/refresh`                                                                   | refresh token | rotate tokens                      |
| `POST /auth/logout`                                                                    | access        | revoke current session             |
| `POST /auth/verify-email` / `.../resend`                                               | public        | email verification                 |
| `POST /auth/password-reset/request` / `.../confirm`                                    | public        | password reset                     |
| `POST /stream/ticket`                                                                  | access        | SSE stream ticket                  |
| `GET /sessions`, `PATCH /sessions/:id`, `DELETE /sessions/:id`, `DELETE /sessions`     | access        | session management                 |
| `GET /me`, `PATCH /me/profile`, `POST /me/email`                                       | access        | own account                        |
| `PUT /me/avatar`, `DELETE /me/avatar`                                                  | access        | avatar                             |
| `PATCH /me/username`                                                                   | access        | identifier change (policy-driven)  |
| `GET /users/:identifier`, `GET /users/:identifier/avatar`                              | access        | public profile                     |
| `POST /invitations`, `GET /invitations`, `DELETE /invitations/:id`                     | owner         | invitations                        |
| `POST /admin/users`                                                                    | owner         | create account (`admin` mode)      |
| `POST /admin/users/:id/suspend` / `unsuspend`, `DELETE /admin/users/:id`               | owner         | account lifecycle                  |
| `POST /admin/owners`, `DELETE /admin/owners/:userId`                                   | owner         | owner management                   |
| `POST /admin/username-requests/:id/approve` / `reject`, `GET /admin/username-requests` | owner         | approval-mode username changes     |

The `/admin/*` endpoints here are the minimal owner surface needed by this
feature; the full admin experience is [server administration](../server-administration/overview.md).

## 17. Identifier change flows

- `immutable` → `PATCH /me/username` returns `403 identity.username_immutable`.
- `available` → validate + availability + `identity.username_change_cooldown`
  since the last change → apply immediately; insert the old `name` into
  `reserved_username` (`reason: "username_changed"`,
  `reservedUntil = now + identity.username_release_delay`); `audit_log`.
- `approval` → create a `UsernameChangeRequest` (`pending`); owner approves or
  rejects; on approval, apply as above.

## 18. Emails (templates, server-core `Mailer`)

`email-verification`, `password-reset`, `invitation` (email-bound only),
`email-changed-notice`. English, text + HTML, shared layout with `server.domain`
and `web_url`.

## 19. Alternatives considered

| Point                            | Retained                                                                                                                                                           | Rejected                                     | Why                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------------ |
| Access token type                | JWT EdDSA (server key)                                                                                                                                             | opaque + DB lookup per request               | stateless verification; revocation covered by short TTL + `sid` denylist       |
| Refresh token                    | opaque, rotating, reuse-detection                                                                                                                                  | JWT refresh; non-rotating                    | rotation + reuse detection contains token theft; opaque = instantly revocable  |
| Unverified accounts              | login blocked until verified (when required)                                                                                                                       | allow login, gate actions                    | simpler; matches "email mandatory and verified"; no half-state to reason about |
| Deleted `name`                   | freed after `username_release_delay`                                                                                                                               | kept forever; freed immediately              | user choice; grace window avoids immediate impersonation                       |
| Invitation issuers (increment 1) | owners only                                                                                                                                                        | any member; member + flag                    | user choice; spaces/roles do not exist yet                                     |
| Avatar storage                   | server-core `BlobService` (dedup)                                                                                                                                  | column blob; separate table                  | the file storage and quotas design; avatars are files like any other                                     |
| Password hash lib                | `@node-rs/argon2`                                                                                                                                                  | `argon2` (node-gyp), `bcrypt`                | native, Bun-friendly, Argon2id is the OWASP recommendation                     |
| Sensitive-endpoint throttle      | narrow in-memory guard now                                                                                                                                         | wait for the general rate-limiter            | credential endpoints cannot ship unprotected; scope is minimal                 |
| Email case-insensitivity         | normalise-on-write + plain unique `text` ([identity account and token mechanics](../../../../docs/technical/identity-account-and-token-mechanics.md)) | `citext` column; `lower(email)` unique index | no extension dependency; one rule for `name` and `email`                       |

## 20. Consequences

- Creates the `identity` module and its tables; no migration of existing data
  (greenfield).
- Introduces the `AuthGuard` / `OwnerGuard` / request-context contract that every
  later feature relies on.
- Establishes the `sid` denylist as an in-process concern → becomes a
  Redis-backed concern at the same time as the SSE backplane (multi-instance).
- The SSE ticket store and `GET /events` consumer are specified here but
  completed with [conversations](../conversations/overview.md).
- Forward contracts recorded for conversations: user resolution for deleted
  users, mention/authorship by `User.id`, name changes never rewriting history.
- `server-administration` will extend `/admin/*` (pagination, filters,
  activity), not replace it.

## 21. Client scope: verified findings

Everything below was checked against the code at the time of writing.

| # | Finding | Evidence | Consequence |
| - | ------- | -------- | ----------- |
| F1 | Server and SDK already cover profile read/update, avatar upload/removal, email change, username change, self-deletion and the four session operations. | [me.ts](../../../../packages/sdk/src/resources/me.ts), [sessions.ts](../../../../packages/sdk/src/resources/sessions.ts), [profile.controller.ts](../../../../apps/server/src/modules/identity/profile/profile.controller.ts) | These are reused as they are. |
| F2 | There is no password change for a signed-in user. Only the email reset flow sets a new hash. | [password-reset.service.ts](../../../../apps/server/src/modules/identity/accounts/password-reset.service.ts), [protocol](../../../../docs/protocol/identity.md) | New endpoint (S1). |
| F3 | The username change policy (`identity.username_change_policy`) is a server-side setting the client cannot read. The cooldown is computed from the last `identity.username_changed` audit entry. | [registry.ts:230](../../../../apps/server/src/core/config/registry.ts), [username.service.ts:152](../../../../apps/server/src/modules/identity/accounts/username.service.ts) | New state endpoint (S2). |
| F4 | In `approval` mode `changeOwn` inserts a new pending request on every call: nothing prevents several pending requests for one user, and nothing lets the user cancel one. | [username.service.ts:46](../../../../apps/server/src/modules/identity/accounts/username.service.ts) | Single pending request, cancellation (S2). |
| F5 | A pending email change exists only as an unconsumed `EmailVerification` row whose `email` differs from `User.email`. `MeView` does not expose it. `startVerification` deletes every earlier unconsumed row of the user, so at most one pending row exists. | [email-verification.service.ts:61](../../../../apps/server/src/modules/identity/email-verification/email-verification.service.ts), [profile.dto.ts:23](../../../../apps/server/src/modules/identity/profile/profile.dto.ts) | `MeView.pendingEmail` (S3), no schema change. Resending re-submits `POST /me/email`. |
| F6 | `GET /users/:identifier/avatar` needs a Bearer token, so an `<img src>` cannot load it. The SDK transport only parses JSON and sends `Accept: application/json`. The route answers `private, max-age=31536000, immutable` on a URL that stays the same when the avatar is replaced. | [profile.controller.ts:121](../../../../apps/server/src/modules/identity/profile/profile.controller.ts), [http-client.ts:114](../../../../packages/sdk/src/transport/http-client.ts), [profile.service.ts:228](../../../../apps/server/src/modules/identity/profile/profile.service.ts) | Blob binding in the SDK (S5), versioned `avatarUrl` (S4). |
| F7 | A wrong password on `POST /me/email` and `DELETE /me` answers `401 auth.invalid_credentials` (code and e2e), while the protocol page says `403`. The SDK maps that code to `InvalidCredentialsError`, which is not an `AuthenticationError`: it neither triggers a refresh nor signs the user out. | [identity.errors.ts:21](../../../../apps/server/src/modules/identity/identity.errors.ts), [identity-lifecycle.e2e-spec.ts:316](../../../../apps/server/src/modules/identity/identity-lifecycle.e2e-spec.ts), [protocol](../../../../docs/protocol/identity.md), [errors.ts](../../../../packages/sdk/src/transport/errors.ts) | The protocol page is fixed (`401`). The client shows a field error for it. |
| F8 | `GET /sessions` returns revoked sessions too (`listForUser` has no filter). A revoked session cannot refresh (`AuthService.refresh` checks `getActive`). | [session.service.ts:76](../../../../apps/server/src/modules/identity/auth/session.service.ts), [auth.service.ts:97](../../../../apps/server/src/modules/identity/auth/auth.service.ts) | The client filters `revokedAt === null`. `revokeAllForUser` is enough to cut sessions (no refresh-token burn needed). |
| F9 | The SDK session keeps the `identifier` it got at login; a username change does not update it. | [session-manager.ts](../../../../packages/sdk/src/session/session-manager.ts) | The client reads the identifier from `useMe()`, never from `useSession()` (L1). |
| F10 | The [`auth` design](../auth/technical.md) (C1, C6) already covers the shell and the user menu: `routes/_app.tsx` passes a `userMenu` to `AppShell`, and `features/auth/components/user-menu.tsx` (display name with initials fallback, "Sign out") is issue [#93](https://github.com/marmotz/ekoz/issues/93). It states that the `/account` screens add their entry later and that the avatar image is left to this feature. Every protected route lives under `routes/_app/` ([#92](https://github.com/marmotz/ekoz/issues/92)). A feature may not import another, and `registerNav` shows the accepted pattern (registry in `shared`). | [auth technical C6](../auth/technical.md), [topbar.tsx](../../../../apps/client-web/src/shared/layout/topbar.tsx), [eslint.config.js](../../../../apps/client-web/eslint.config.js), [nav-registry.ts](../../../../apps/client-web/src/shared/layout/nav-registry.ts) | `auth` keeps the menu and Sign out. This feature adds a menu-entry registry in `shared/layout` that `UserMenu` reads (§24). |
| F11 | `useMe` does not exist. [`#65`](https://github.com/marmotz/ekoz/issues/65) (`web-client-rooms`) creates `shared/sdk/use-me.ts` with key `['me']` and is independent of everything else. | [web-client-rooms technical §4.1](../web-client-rooms/technical.md) | This feature depends on `#65` instead of creating a second `useMe`. |
| F12 | `client.me.deleteAccount` clears the session store and emits `session:cleared`. `SessionGuard` only listens to `session:invalid`, but `useSession()` follows `session:cleared`, so `RequireAuth` redirects to `/login`. The query cache is not cleared. | [me.ts](../../../../packages/sdk/src/resources/me.ts), [session-guard.tsx](../../../../apps/client-web/src/app/session-guard.tsx), [session.ts](../../../../apps/client-web/src/shared/sdk/session.ts) | The deletion mutation clears the query cache itself. |
| F13 | `auth` generates its forms with kurotako `gen-react` and TanStack Form ([auth technical §4](../auth/technical.md)); [#94](https://github.com/marmotz/ekoz/issues/94) wires the generator, adds `zod` and `@tanstack/react-form`, and is blocked until `@kurotako/gen-react` is published. [#92](https://github.com/marmotz/ekoz/issues/92) adds `input`, `label`, `card` and extends `createFakeSdk` with `auth` and `me` stubs. #94 puts `PasswordInput` and the field wrappers in `features/auth/components`, which this feature cannot import. `textarea` and `dialog` do not exist; `@radix-ui/react-dialog` is already installed (used by `sheet`). i18n keys are typed from `common.json` only. | [package.json](../../../../apps/client-web/package.json), [sdk-mock.ts](../../../../apps/client-web/test/sdk-mock.ts), [use-translation.ts](../../../../apps/client-web/src/shared/i18n/use-translation.ts) | Same generated forms (product decision), so the screens wait on #94. `PasswordInput` and the field wrappers move to `shared/ui`. New: `textarea`, `dialog`; strings under `account.*` in `common.json`; `createFakeSdk` gets `sessions` and `users` stubs. |

## 22. Server changes

Each change follows the repository flow: update the Zod DTO, then
`bun run openapi:emit` (committed `apps/server/openapi.json`, checked by
`openapi:check`), then `bun run generate` for the SDK types. The protocol page
[`docs/protocol/identity.md`](../../../../docs/protocol/identity.md) is edited first
in the same change.

### S1. Password change

`POST /me/password`, authenticated, body `{ currentPassword, newPassword }`, `204`.

- New `PasswordChangeService` in `accounts/` (deps: `AccountService`,
  `PasswordService`, `SessionService`, `AuditService`) and a `MePasswordController`
  guarded by `AuthGuard`.
- Verify `currentPassword` with `PasswordService.verify`; on mismatch throw the
  existing `InvalidCredentialsError` (`401 auth.invalid_credentials`, same as
  `POST /me/email` and `DELETE /me`).
- `PasswordService.assertAcceptable(newPassword)` (`422 identity.password_too_weak`).
  A `newPassword` equal to `currentPassword` is rejected with the same code and a
  dedicated `detail`.
- `AccountService.updatePasswordHash`, then
  `SessionService.revokeAllForUser(userId, { exceptSessionId: principal.sessionId, reason: 'password_changed' })`.
  The current session stays open; every other session is cut (F8).
- `audit_log("auth.password_changed")` with `{ revokedSessions }`.

### S2. Username change state and cancellation

Same controller as `PATCH /me/username` (`MeUsernameController`, route
`me/username`).

- `GET /me/username`, authenticated, `200`:
  `{ policy: 'immutable' | 'available' | 'approval', nextChangeAt: string | null, pendingRequest: { id, requestedName, createdAt } | null }`.
  - `nextChangeAt` is non-null only for `available` and while the cooldown runs:
    last `identity.username_changed` audit entry + `identity.username_change_cooldown`.
    `assertCooldownClear` is refactored so both use one `lastChangeAt(userId)` helper.
  - `pendingRequest` is the user's `UsernameChangeRequest` with `status = pending`
    (also returned if the policy changed since it was created: an owner can still
    resolve it, and the user can still cancel it).
- Single pending request: in the `approval` branch of `changeOwn`, after
  `assertAvailable` and before the insert, an existing pending request of the user
  raises the new `UsernameRequestPendingError`
  (`409 identity.username_request_pending`).
- `DELETE /me/username/request`, authenticated, `204`. Sets the pending request to
  `cancelled` (`resolvedAt = now`, `resolvedByUserId = userId`) and records
  `identity.username_change_cancelled`. `404 identity.username_request_not_found`
  if there is none.
- `UsernameChangeStatus` gains `cancelled` in
  [contract.prisma](../../../../apps/server/src/core/prisma/contract.prisma) (a
  `pg/text@1` enum: `bun run db:plan` decides whether a migration file is emitted),
  in `UsernameChangeRequestSchema`, in the `UsernameChangeRequestRow` union and in
  the `status` enum of `GET /admin/username-requests`. `approve` and `reject`
  already refuse a non-pending row with `identity.username_request_resolved`.

### S3. Pending email in `MeView`

`MeViewSchema` gains `pendingEmail: string | null` (`z.email().nullable()`).

- `AccountService.pendingEmailOf(userId)`: the user's `EmailVerification` row with
  `consumedAt` null, `expiresAt > now` and `email !== User.email`, else `null`.
- `ProfileService.getMe` fills it, so `GET /me` and `PATCH /me/profile` both carry
  it. `AccountView` (registration, admin) is untouched.
- No schema change and no new endpoint: resending is `POST /me/email` again with
  the same address and the password (decided in the overview), which
  `startVerification` handles by replacing the stale row. The current address
  receives a new `email-changed-notice` on each call.

### S4. Versioned `avatarUrl`

`ProfileService.avatarUrl` (the single builder behind `GET /me`,
`GET /users/:identifier` and the `PUT /me/avatar` response) appends
`?v=<avatarBlobId>`. `BlobService.ingest` deduplicates by content, so the blob id
changes exactly when the avatar changes; no extra query is needed.

- The avatar route ignores `v`. Its `private, immutable` cache stays correct because
  the URL now changes with the content.
- The builder is shared: pure helpers in `apps/server/src/core/http/user-links.ts`,
  `avatarUrl(apiUrl, name, blobId)` and `userIdentifier(name, serverDomain)`, used by
  `ProfileService` and `toAccountView`. `core` is importable by `conversations`, which
  cannot import `identity`.
- Contract: every `avatarUrl` emitted by the server carries the same `?v=<blobId>`
  suffix. `UserSummary` of [`web-client-rooms`](../web-client-rooms/technical.md) S3
  (issue [`#63`](https://github.com/marmotz/ekoz/issues/63)) imports the helpers, so
  #63 depends on [#103](https://github.com/marmotz/ekoz/issues/103).

## 23. SDK changes

`packages/sdk` gets a `minor` changeset.

- `HttpClient.request` gains `responseType?: 'json' | 'blob'` (default `json`). In
  `blob` mode it sends `Accept: image/*` and returns `await response.blob()`.
  Non-2xx responses still go through `decodeProblem`. `SessionManager.request`
  forwards the option unchanged, so the refresh-and-replay behaviour applies.
- `me.changePassword(body: ChangePasswordBody): Promise<void>` (S1).
- `me.usernameState(): Promise<UsernameChangeState>` and
  `me.cancelUsernameRequest(): Promise<void>` (S2).
- `users.avatar(identifier: string, options?: { version?: string; signal?: AbortSignal }): Promise<Blob>`:
  `GET /users/{encoded identifier}/avatar`, `?v=` when `version` is given.
- No new error class: the new code `identity.username_request_pending` falls back to
  the generic `EkozError` with its `code`, as the SDK does for any unknown code.
- Wire types come from the regenerated `generated/api`; `types/wire.ts` re-exports
  `ChangePasswordBody`, `UsernameChangeState`, `UsernameChangePendingRequest`
  and the widened `UsernameChangeRequest` status.
- Tests: the `me` and `users` resource tests, the `HttpClient` blob mode
  (success, problem response, headers).

## 24. Client design

### Layout

```
src/features/profile/
  api/         # query keys, error-to-message mapping
  hooks/       # useUpdateProfile, useSetAvatar, useDeleteAvatar, useChangeEmail,
               # useUsernameState, useChangeUsername, useCancelUsernameRequest,
               # useChangePassword, useSessions, useRenameSession, useRevokeSession,
               # useRevokeOtherSessions, useDeleteAccount
  components/  # ProfileSection, AvatarEditor, UsernameSection,
               # EmailSection, PasswordSection, SessionsSection, DangerZone,
               # DeleteAccountDialog
  routes/      # AccountPage (composes the sections)
src/routes/_app/account.tsx            # createFileRoute('/account'), RequireAuth; registers the
                                       # "Account" menu entry at import time
src/shared/layout/user-menu-items.ts   # registerUserMenuItem / getUserMenuItems / clear (test helper)
src/shared/sdk/use-me.ts               # created by #65
src/shared/sdk/use-avatar-src.ts       # blob fetch + object URL
src/shared/ui/user-avatar.tsx          # Avatar + initials fallback over useAvatarSrc
src/shared/ui/{textarea,dialog}.tsx    # new; input, label, card come from #92
src/shared/ui/{password-input,form-field}.tsx  # moved from features/auth (#94)
src/generated/                         # gen-react hooks and Zod schemas (root tako config)
```

The feature imports only `shared` and itself; `routes -> features` is allowed by the
boundary matrix. `useMe`, `useAvatarSrc` and `UserAvatar` sit in `shared` because
`web-client-rooms` and `web-client-chat` (authors) reuse them without importing this
feature. Routes sit under `routes/_app/` as required by #92.

### User menu entries

The menu itself belongs to `auth` ([#93](https://github.com/marmotz/ekoz/issues/93):
display name, "Sign out"). Since a feature cannot import another, this feature adds a
small registry, `shared/layout/user-menu-items.ts`:
`registerUserMenuItem({ id, order, to, labelKey, icon })`, de-duplicated by `id` like
`registerNav`. `src/routes/_app/account.tsx` registers the "Account" entry at import
time, as `src/routes/_app/index.tsx` registers `home`. The task modifies the `UserMenu`
of #93 to render the registered entries above "Sign out" and to show `UserAvatar`
(instead of initials only) next to the name. Sign out keeps calling
`sdk.auth.logout()`; `SessionGuard` does the redirect.

### Avatar rendering

`useAvatarSrc(identifier, avatarUrl)`:
`useQuery({ queryKey: ['avatar', avatarUrl], queryFn: () => sdk.users.avatar(identifier, { version }), staleTime: Infinity, enabled: sdk !== null && avatarUrl !== null })`
where `version` is the `v` search parameter of `avatarUrl`. The blob is turned into
an object URL in an effect that revokes it on cleanup or change. Because the URL is
versioned (S4), a new upload changes the query key and refetches; no manual
invalidation is needed. `UserAvatar` shows the initials of the display name while
loading, on error and when there is no avatar.

### `/account` page

One route, `staticData.title = 'account.title'`, wrapped in `RequireAuth`, sections
in this order. Forms use the `auth` approach ([auth technical §4](../auth/technical.md)):
headless hooks generated by `@kurotako/gen-react` on TanStack Form, validated by the
generated Zod schemas, with hand-written fields (shadcn/ui, i18n). The generated
request bodies to add to the restricted list in `tako.config.ts` are `UpdateProfileDto`,
`ChangeEmailDto`, `ChangeUsernameDto`, `ChangePasswordDto` (new, S1), `RenameSessionDto`
and `DeleteMeDto`; the confirm-password mismatch is a refinement at the call site.
Submit buttons are disabled while the mutation runs and errors render in an `aria-live`
region under the relevant field. The server stays authoritative for the rest (password
policy, biography length, identifier rules).

| Section | Behaviour | Calls |
| ------- | --------- | ----- |
| Profile | Display name input, biography textarea, save sends only changed fields. On success `setQueryData(['me'], result)`. | `me.updateProfile` |
| Avatar | File input (`image/png,image/jpeg,image/webp,image/gif`), upload and remove buttons. On success the `avatarUrl` in the `['me']` cache is replaced. | `me.setAvatar`, `me.deleteAvatar` |
| Identifier | Shows `@name/server`. Driven by `['account', 'username-state']`: `immutable` shows a read-only note; `available` shows the form, disabled with the date while `nextChangeAt` is in the future; `approval` shows the form with an approval note; a `pendingRequest` replaces the form by "awaiting approval for `<name>`" and a Cancel button. The input takes the bare `name`, the `/server` suffix is static text. On `applied`, `['me']` and the state are invalidated. | `me.usernameState`, `me.changeUsername`, `me.cancelUsernameRequest` |
| Email | Shows the current address and whether it is verified. When `pendingEmail` is set: "verification pending for `<address>`" and a "Resend" button that asks for the password and re-submits that address. Form: new address + current password. | `me.changeEmail` |
| Password | Current, new, confirmation (mismatch checked client-side). Success toast says the other devices were signed out; the sessions list is invalidated; fields are cleared. | `me.changePassword` |
| Sessions | Active sessions only (`revokedAt === null`), newest `lastSeenAt` first, the current one flagged and without a revoke button. Inline rename (1 to 100 characters), revoke, "Sign out other sessions" reporting the count. | `sessions.list`, `.rename`, `.revoke`, `.revokeAllOthers` |
| Danger zone | Opens `DeleteAccountDialog`: consequences text (profile erased, messages anonymised), password field, confirm button. On success: `queryClient.clear()` and a toast; `RequireAuth` redirects because the SDK cleared the session (F12). | `me.deleteAccount` |

### Errors and strings

`features/profile/api/error-messages.ts` maps an error to a translation key by
`EkozError.code`, with `NetworkError`, `RateLimitError` (uses `retryAfter`) and a
generic fallback:

| Code | Shown |
| ---- | ----- |
| `auth.invalid_credentials` | wrong password, under the password field |
| `identity.password_too_weak` | password rejected |
| `identity.email_taken` | address already used |
| `identity.identifier_invalid` | rules: lowercase, `a-z 0-9 _ . -`, at most 64 characters |
| `identity.username_taken` | identifier unavailable |
| `identity.username_immutable`, `identity.username_change_cooldown`, `identity.username_request_pending` | message, then the username state is refetched |
| `identity.profile_invalid` | biography too long |
| `identity.avatar_too_large`, `identity.avatar_rejected` | avatar message |
| `identity.last_owner` | "You are the only owner: promote another owner in the admin console first" |

All strings live under `account.*` in the `common.json` catalogues (French and
English), the same choice as `rooms.*` in `web-client-rooms`.

### Tests

Vitest and Testing Library, SDK faked with `createFakeSdk` (`auth` and `me` stubs from #92, `sessions`
and `users` added here). Per section: happy path, each mapped error, pending state;
plus the user-menu entries registry (de-duplication, order), `UserMenu` rendering the
Account entry and the avatar, `useAvatarSrc` (object URL created and
revoked, version key change refetches), `AccountPage` guard, and the deletion cache
clear.

## 25. Delivery order

Server changes first, then the SDK, then the screens, so nothing is built against a
missing endpoint:

1. Server S1 (password change), S2 (username state and cancellation), S3 and S4
   (`pendingEmail`, versioned `avatarUrl`), each with its protocol page and OpenAPI
   update. Independent of each other.
2. SDK bindings (§23). Depends on 1.
3. Client shared pieces: user-menu entries registry and `UserMenu` update,
   `useAvatarSrc`, `UserAvatar`, `textarea`, `dialog`, `PasswordInput` and field
   wrappers moved to `shared/ui`, `createFakeSdk` extension, `tako.config.ts` entities.
   Depends on 2, on `#65`, `#92`, `#93` and `#94` (the latter blocked until
   `@kurotako/gen-react` is published).
4. Client `/account`: route, Profile and Avatar sections.
5. Client: Identifier, Email and Password sections.
6. Client: Sessions and Danger zone.
7. Documentation page (§27) and the protocol changelog. Depends on 4 to 6.

## 26. Alternatives considered

| Point | Retained | Rejected | Why |
| ----- | -------- | -------- | --- |
| Password change endpoint | `POST /me/password` `{ currentPassword, newPassword }` | `PATCH /me` with a password field; reusing password reset | Same action style as `POST /me/email`; keeps `PATCH /me/profile` non-sensitive; the reset flow needs a mail round trip. |
| Effect on other sessions | Revoke every other session | Optional checkbox; no revocation | Matches password reset; a changed password should cut a stolen session. |
| Avatar to the browser | Authenticated blob through the SDK, object URL | Token in the query string; cookie auth; signed short-lived URLs | The SDK is the only network path; a token in a URL leaks into logs and history; cookie auth and signed URLs are new mechanisms nobody else needs yet. |
| Avatar cache | Versioned URL (`?v=<blobId>`), keep `immutable` | `no-cache` with ETag revalidation | The URL changes with the content, so the query key refreshes by itself and the long cache stays valid. |
| Username state | Dedicated `GET /me/username` | Fields in `MeView` | `MeView` is fetched everywhere (`useMe`); the state is only needed on one page and depends on config and audit reads. |
| Pending username requests | One at a time, cancellable | Several allowed; replace silently | Bounded owner workload; explicit user control; a new status is cheap. |
| Pending email | `pendingEmail` in `MeView` | Separate endpoint | One extra lookup and no new column, on an endpoint the page already calls. |
| Pending email resend | Re-submit `POST /me/email` with the password (product decision) | `POST /me/email/resend` without password | No new endpoint; the price is one more notice mail to the old address per resend. |
| User menu | `auth` owns the menu and Sign out (#93); this feature adds its entry through a `shared/layout` registry | A second menu owned here; this feature importing `auth`'s menu | `auth` already designed and ticketed it; a feature cannot import another; the registry matches `registerNav`. |
| Forms | Generated with `gen-react` + TanStack Form, like `auth` (product decision) | Native controlled forms | One form style in the client, at the price of waiting for the generator to be published. |

## 27. Documentation

A page `docs/technical/web-client-account.md` records the client design (user-menu
menu entries, avatar rendering, `/account` sections, error mapping) and the three server
decisions (password change, single cancellable username request, versioned
`avatarUrl`). The avatar caching bullet of
[identity lifecycle and abuse protection](../../../../docs/technical/identity-lifecycle-and-abuse-protection.md)
links to it. The protocol page gains the new endpoints, `MeView.pendingEmail`, the
versioned `avatarUrl`, the `cancelled` status, the new error code, and the `401`
correction of F7; the protocol changelog gets its entry.

## 28. Consequences

- No schema migration for S1, S3, S4. S2 changes a text-typed contract enum; the
  emitted migration, if any, is decided by `bun run db:plan`.
- `apps/server/openapi.json` and the SDK generated types change; `openapi:check`
  in CI enforces the committed file. Changelog entries: `apps/server`,
  `apps/client-web`, a `minor` changeset for `@ekozhq/sdk`, and the protocol
  changelog.
- The admin console is unaffected: `apps/admin` only requests the `pending`,
  `approved` and `rejected` filters, so `cancelled` rows never reach its table
  ([username-requests.tsx](../../../../apps/admin/src/routes/username-requests.tsx)).
- Any future author-avatar display (rooms, chat) reuses `UserAvatar`: one
  authenticated fetch per distinct `avatarUrl`, cached for the session.
- This feature depends on `web-client-rooms` issue `#65` (`useMe`) and on `auth`
  issues `#92` (layouts, UI base, test support), `#93` (user menu) and `#94`
  (generated forms, blocked on the publication of `@kurotako/gen-react`), so the
  screens cannot start before that package exists.
- `PasswordInput` and the field wrappers written in `features/auth` by #94 are moved to
  `shared/ui`, and `auth`'s imports updated, by the shared-pieces task.

### Known limitations

- L1. The SDK session `identifier` is stale after a username change (F9). Readers use
  `useMe()`. Refreshing it in the SDK is a possible follow-up.
- L2. `POST /me/email`, `DELETE /me` and the new `POST /me/password` verify a password
  without the `SensitiveThrottleGuard`, which keys on the client IP plus an
  `identifier` or `email` body field that these bodies do not have. Brute force needs a
  valid access token. Throttling authenticated password checks is a follow-up.
- L3. No notification mail is sent after a password change.
- L4. No client-side upload size or type pre-check beyond the `accept` attribute: the
  limits are server configuration; the server errors are mapped.
- L5. The account forms do not know the password length policy: `auth`'s
  `GET /auth/policy` hook lives in `features/auth`. The server error is shown.

## Implementation task breakdown

GitHub issues in `marmotz/ekoz`, label `feature:identity-and-profiles`, in dependency
order (§25). The first-increment server tasks (§1 to §20) are done; their former task
files no longer exist in this repository.

1. [#101](https://github.com/marmotz/ekoz/issues/101): server, `POST /me/password` (S1)
2. [#102](https://github.com/marmotz/ekoz/issues/102): server, username change state, single pending request, cancellation (S2)
3. [#103](https://github.com/marmotz/ekoz/issues/103): server, `pendingEmail` in `MeView`, versioned `avatarUrl` and the shared `user-links` helpers (S3, S4); blocks `web-client-rooms` #63
4. [#104](https://github.com/marmotz/ekoz/issues/104): SDK bindings (§23); depends on #101, #102, #103
5. [#105](https://github.com/marmotz/ekoz/issues/105): client shared pieces; depends on #104, #65, #92, #93, #94
6. [#106](https://github.com/marmotz/ekoz/issues/106): client `/account` route, profile and avatar sections; depends on #105
7. [#107](https://github.com/marmotz/ekoz/issues/107): client identifier, email and password sections; depends on #106
8. [#108](https://github.com/marmotz/ekoz/issues/108): client sessions and danger zone; depends on #106
9. [#109](https://github.com/marmotz/ekoz/issues/109): documentation page; depends on #107, #108
