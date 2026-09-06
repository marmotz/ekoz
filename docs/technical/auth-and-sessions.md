# Authentication and sessions

## Context

The first increment uses password authentication (no MFA, no external identity
provider). Suspending an account must invalidate sessions and block all access.
Users must be able to manage their devices. The web client may be hosted on a
different origin than the API.

## Decision

- **Access token**: short-lived JWT (~15 min), carries the session id (`sid`).
- **Refresh token**: opaque, long-lived, stored hashed in the database.
- **Named multi-device sessions**:
  `sessions(id, user_id, device_name, created_at, last_seen, ip, revoked_at)`.
  Revocation on demand (user) or forced (server: suspension → `revoked_at` on all
  sessions + login and access block).
- Fast revocation despite the JWT: short TTL + a denylist of revoked `sid` in
  cache, checked on every refresh and on sensitive endpoints.
- **SSE stream**: `EventSource` cannot set an `Authorization` header.
  Authentication via a **single-use, short-lived ticket**: `POST /stream/ticket`
  (normally authenticated) returns a ~30 s single-use ticket; `GET /events?ticket=…`
  opens the stream. Works when the client and the server are on different
  domains.

## Consequences

- The ticket travels in the query string but is single-use and ephemeral;
  acceptable.
- Password hashing uses Argon2id.
