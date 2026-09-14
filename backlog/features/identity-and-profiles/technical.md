# Identity and profiles — technical design

Technical design for local accounts, authentication, sessions and profiles.
Builds on [server core](../server-core/technical.md); the `server` repository is
greenfield, so this document defines the initial module rather than referencing
existing code.

Related: [user identifier](../../../docs/technical/user-identifier.md),
[auth-and-sessions](../../../docs/technical/auth-and-sessions.md),
[server-initialization](../../../docs/technical/server-initialization.md),
[api-conventions](../../../docs/technical/api-conventions.md).

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
([identity account and token mechanics](../../../docs/technical/identity-account-and-token-mechanics.md)).

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
feature; the full admin experience is [server administration](../../_archives/features/server-administration/overview.md).

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
| Email case-insensitivity         | normalise-on-write + plain unique `text` ([identity account and token mechanics](../../../docs/technical/identity-account-and-token-mechanics.md)) | `citext` column; `lower(email)` unique index | no extension dependency; one rule for `name` and `email`                       |

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

## Implementation task breakdown

GitHub issues in `marmotz/ekoz`. Roughly in dependency order.

1. [ — user model, identifier, password hashing (done)](../../tasks/done/server-12-identity-user-model-and-identifier.md)
2. [ — auth tokens, refresh rotation, guards (done)](../../tasks/done/server-13-identity-auth-tokens-and-guards.md)
3. [ — session management endpoints (done)](../../tasks/done/server-14-identity-session-management.md)
4. [ — registration modes and invitations (done)](../../tasks/done/server-15-identity-registration-and-invitations.md)
5. [ — email verification and email change (done)](../../tasks/done/server-16-identity-email-verification.md)
6. [ — password reset (done)](../../tasks/done/server-17-identity-password-reset.md)
7. [ — first-owner setup endpoint (done)](../../tasks/done/server-18-identity-first-owner-setup-endpoint.md)
8. [ — profile and avatar (done)](../../tasks/done/server-19-identity-profile-and-avatar.md)
9. [ — identifier change (policy-driven) (done)](../../tasks/done/server-20-identity-identifier-change.md)
10. [ — suspension, deletion, owner management (done)](../../tasks/done/server-21-identity-account-lifecycle.md)
11. [ — throttle on credential endpoints (done)](../../tasks/done/server-22-identity-sensitive-endpoint-throttle.md)
12. [ — SSE stream ticket (done)](../../tasks/done/server-23-identity-sse-stream-ticket.md)
