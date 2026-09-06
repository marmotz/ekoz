# Identity account and token mechanics

## Context

[user identifier](user-identifier.md) fixes the `name/server` identifier and
[authentication and sessions](auth-and-sessions.md) fixes the session model (short JWT access
token + rotating opaque refresh token, `sid` denylist, Argon2id). The
`identity-and-profiles` technical design then sketched a few mechanics that were
never pinned centrally and are cheap to get wrong across the later identity
tasks: the storage of the email address, how the access-token JWT is actually
produced, and the shape of the refresh-token record. Issues #12–#14 implement
them and need the choices recorded.

## Decision

### Email storage

- `user.email` is a plain `text` column with a unique constraint, storing the
  address already normalised (NFC, trimmed, lower-cased) by the account layer —
  the same normalisation `user.name` gets.
- The `citext` extension floated in the technical design's alternatives table is
  **not** used: normalise-on-write gives the same case-insensitive uniqueness
  with no extension dependency, no surprise in raw SQL, and one consistent rule
  for both identifier columns. `contract infer` / migration review also stay
  simpler without a non-default column type.
- Both `name` and `email` are nullable and set to `null` on account deletion so
  the unique indexes free up for reuse (subject to the
  `identity.username_release_delay` reservation for `name`).

### Access token (JWT)

- The access token is a compact JWS built directly on `SigningService`, not via
  a JWT library: header `{ alg: "EdDSA", typ: "JWT", kid }`, claims
  `{ iss, sub, sid, iat, exp }`, signature over `base64url(header).base64url(payload)`
  produced by the active server Ed25519 key.
- `kid` carries the signing key id, so verification reuses the existing
  key-lookup / overlap-window logic ([server secret box and signing keys](server-secret-box-and-signing-keys.md)).
  `iss` is `server.domain`; verification checks signature, `iss` and `exp`.
  Session revocation and account status are the guard's job, out of band.
- Rationale: the server already owns the keypair and its rotation; a library
  would only re-wrap `crypto.sign`. EdDSA JWS is a ~40-line helper with an
  explicit, auditable verification path.

### Refresh token record

- 32 random bytes, base64url, returned once; only `sha256` of it is stored
  (`refresh_token.token_hash`, unique).
- One usable token per session: `refresh` sets `used_at` on the presented row,
  links `replaced_by_id` to its successor, and issues a fresh row. A second
  presentation of a row whose `used_at` is set is reuse — the whole session is
  revoked and `auth.refresh_reuse_detected` is audited.
- Absolute expiry only (`auth.refresh_token_ttl`, default 30 d); no sliding
  window in this increment.

### Guard scope

- `AuthGuard` and `OwnerGuard` ship as opt-in guards (`@UseGuards(...)`), not a
  global `APP_GUARD`, until every `src/core` controller has been audited for
  `@Public()`. Promoting `AuthGuard` to global is a later, separate change.

## Consequences

- No `citext` (or any) extension is required by the identity schema.
- The access-token format is server-defined; third-party verifiers use the
  discovery document + `kid`, exactly as for federation signatures.
- Every credential endpoint added later (#15–#18) reuses `PasswordService`,
  `TokenService`, `SessionService` and the two guards unchanged.
