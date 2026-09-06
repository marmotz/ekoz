# 0022 — Server secret box and signing keys

**Status**: accepted

## Context

The server holds secrets at rest (starting with its own Ed25519 signing private
keys, later OAuth client secrets, SMTP credentials that must round-trip, etc.)
and needs a stable way to seal them under the operator-provided `secret.key`
(32 bytes, infra config — see
[ADR 0009](0009-configuration-model.md)).

It also needs a signing identity: [ADR 0006](0006-federation-protocol.md) calls
for a per-server Ed25519 key, published in `/.well-known/ekoz`, rotatable with an
overlap window, and usable to sign internal tokens before federation exists.
[ADR 0007](0007-user-identifier.md) makes `server.domain` part of every user
identifier, so it must be immutable for a deployment's life.

Neither the wire format of a sealed blob, the key-id scheme, nor the rotation
mechanics were pinned anywhere; they are cross-cutting and cheap to get wrong.

## Decision

### Secret box

- **AES-256-GCM**, `secret.key` as the key-encryption key.
- Sealed blob layout: `nonce (12 bytes) || authTag (16 bytes) || ciphertext`,
  stored as a single `bytea`. Self-contained — no side columns.
- Rotating `secret.key` makes every previously sealed value unreadable. That is
  accepted and documented in `config.example.toml`; a re-encryption tool is a
  later concern.

### Signing keys

- Table `server_signing_key`: `id` (short random, 16 hex chars — **not** a
  ULID: it is a public label carried by every signature), `algorithm`
  (`ed25519`), `public_key` (raw 32-byte key, base64), `private_key_enc` (PKCS#8
  DER, sealed by the secret box), `created_at`, `activated_at`, `retired_at`.
- **Exactly one active key** (`activated_at` set, `retired_at` null). It is
  generated lazily on first use if none exists, so a fresh server is
  self-sufficient before the bootstrap flow ([ADR 0010](0010-server-initialization.md))
  runs.
- **Rotation** inserts a new active key and stamps `retired_at = now` on the
  previous one. A retired key stays published — and accepted for verification —
  until `retired_at + signing.key_overlap_seconds` (infra, default 7 days);
  a sweep then deletes it.
- The public form in `/.well-known/ekoz` is `{ public_key, valid_from,
  valid_until }` where `valid_until` is `null` for the active key and
  `retired_at + overlap` for a retired one. Fully specified in
  [`docs/protocol/discovery.md`](../../protocol/discovery.md).

### Domain guard

- `server.domain` is validated at boot as a lower-cased public FQDN (not an IP,
  not `localhost`, not a bare hostname), in the config registry and again in the
  identity guard.
- The domain is pinned in a single-row `server_identity` table on first boot; a
  later boot with a different `server.domain` is **refused**. Once a `User`
  table exists this can be softened to "refused only while users exist".

## Consequences

- One `bytea` per sealed secret; callers never manage nonces.
- Signature verification only needs the discovery document plus the `keyId` on
  the signature; unknown `keyId` ⇒ refresh then reject.
- Losing `secret.key` loses the signing identity (and every other sealed
  secret) — it must be backed up like the database.
- Changing `server.domain` after first boot requires a deliberate operator
  action (restore the old value, or a future migration tool); it is not a
  config tweak.
