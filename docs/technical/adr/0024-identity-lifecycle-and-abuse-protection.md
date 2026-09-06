# 0024 — Identity lifecycle and abuse protection

**Status**: accepted

## Context

[ADR 0023](0023-identity-account-and-token-mechanics.md) pinned the account,
token and guard mechanics for issues #12–#14. The remaining `identity-and-profiles`
tasks — password reset (#17), profile and avatar (#19), policy-driven identifier
changes (#20), suspension / deletion / owner management (#21) and a throttle on
the credential endpoints (#22) — introduce a few decisions that cut across those
tasks and the features that build on identity, and are cheap to get wrong.

## Decision

### Password reset

- `password_reset` row: opaque 32-byte token, only its `sha256` stored, TTL from
  the new runtime parameter `auth.password_reset_ttl` (default `1h`).
- `POST /auth/password-reset/request` always answers `202`; a token and mail are
  produced only for an existing, active account. `confirm` sets the new hash and
  **revokes every session** of the account (sessions and their refresh tokens),
  then audits `auth.password_reset`.

### Suspension precedence

- A suspension revokes every session, so a suspended user's existing access
  tokens would already fail on the `sid` denylist with a generic `401`.
  `AuthGuard` therefore checks account status **before** the denylist: a
  suspended account gets `403 identity.account_suspended` on any authenticated
  request, matching the login-time response. A deleted or missing account stays
  `401`.

### Account deletion

- One transaction: `status = deleted`, `deletedAt`, `name` / `email` nulled,
  `UserProfile` scrubbed (`displayName = "Deleted account"`, `bio = null`,
  avatar blob released), and a `reserved_username` row for the freed `name`
  (`reason = "account_deleted"`, `reservedUntil = now + identity.username_release_delay`).
  Sessions are revoked outside the transaction. `identity.account_deleted` is
  audited.
- Self-service deletion (`DELETE /me`) re-authenticates with the password; the
  owner path (`DELETE /admin/users/:id`) does not.

### Owner invariant

- The server must always keep **at least one active owner**. Suspending,
  deleting or demoting the last owner is refused with `409 identity.last_owner`.

### Identifier changes

- `PATCH /me/username` is driven by `identity.username_change_policy`:
  `immutable` → `403`; `available` → validate + availability + a cooldown
  (`identity.username_change_cooldown`, measured from the last
  `identity.username_changed` audit entry) → apply now; `approval` → create a
  `username_change_request` for an owner to approve or reject.
- Applying a change (either path) reserves the freed `name`
  (`reason = "username_changed"`). History is unaffected: mentions and
  authorship key on the immutable `User.id`.

### Avatar delivery

- Avatars are server-core blobs. Identity owns their `retain` / `release`
  lifecycle across a single transaction on upload and delete.
- `GET /users/:identifier/avatar` streams the blob **directly from the
  identity controller**, which is `AuthGuard`-protected, replicating the
  content-addressed response contract of `GET /blobs/:id` (strong `ETag` on the
  hash, `private, immutable` cache, `304` on `If-None-Match`). It does **not**
  redirect to `/blobs/:id`: that route is only baseline-guarded and carries no
  authenticated principal, so the avatar access policy could not see a user.
- The route still consults the shared `BlobAccessRegistry` before serving —
  the same hook `GET /blobs/:id` uses — so the access decision lives in one
  place. Identity registers the avatar policy: an authenticated caller may read
  any blob currently referenced as somebody's avatar. A blob that fails the
  policy is `404`, exactly as server-core does, without confirming existence.
- The real content type is sniffed from the magic bytes (`file-type`) and
  checked against `avatar.allowed_mime`; size is checked against
  `avatar.max_size_bytes`.

### Credential-endpoint throttle

- General rate limiting stays deferred. This feature ships one **narrow,
  self-contained** guard: a fixed-window, in-memory (per-instance) counter keyed
  by client IP plus the target identifier/email (and nothing else — one shared
  counter across the four endpoints), applied to `POST /auth/login`,
  `/auth/register`, `/auth/password-reset/request` and
  `/auth/verify-email/resend`. Limits come from the new runtime parameter
  `auth.sensitive_throttle` (`{ window, max }`, default `{ "15m", 10 }`). Over
  the limit → `429` `problem+json` with `Retry-After`.
- This is a deliberate, minimal exception, not the general framework, which is
  still owned by a later effort. The counter is per-instance; a shared store
  arrives with the same multi-instance work as the `sid` denylist and the SSE
  backplane.

## Consequences

- Two new runtime parameters (`auth.password_reset_ttl`,
  `auth.sensitive_throttle`) and two new tables (`password_reset`,
  `username_change_request`).
- `DomainError` gains an optional `headers` map so the problem filter can emit
  `Retry-After`.
- Forward contract for conversations: a deleted user resolves to
  "Deleted account" at read time; authorship and mentions never rewrite.
