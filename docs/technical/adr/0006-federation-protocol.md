# 0006 — Federation protocol approach

**Status**: accepted (federation itself is a later increment)

## Context

Three approaches:

- **ActivityPub** (Mastodon, Lemmy): HTTP + JSON-LD, inbox/outbox, WebFinger,
  HTTP Signatures. Existing spec and mindshare, but JSON-LD is painful, the model
  is built for social feeds rather than rooms with membership / ordering /
  backfill, and there is no standard for real time or history.
- **Matrix model**: hash-linked event DAG + state resolution. Proven for chat but
  exactly the complexity the project rejects.
- **Minimal custom protocol**: REST/JSON server↔server API, home server
  authoritative, no DAG.

## Decision

**Minimal custom protocol**, borrowing the reusable bricks from the fediverse:

- Discovery via `/.well-known/ekoz`: real API endpoint, supported protocol
  versions, public signing keys. Decouples the identity domain from the hosting.
- **Per-server Ed25519 signing key**, published in `.well-known`, rotatable with
  an overlap window. Used to authenticate the origin of federated events and to
  guarantee they are not forged.
- Signed server↔server requests (HTTP Signatures).
- The server that creates a federated room manages its structure and assigns the
  ordering (`seq`); other servers are replicas that submit events back to it.
  Consistent with [ADR 0004](0004-event-log-and-ordering.md).
- Severing a relationship: stop emitting and accepting; already-received content
  remains under local retention.

## Consequences

- No interoperability with the existing fediverse; the author owns the spec and
  its security.
- The first-increment log must carry `origin_server` and stable identifiers so
  federation slots in without migration.
- The Ed25519 keys are generated at server initialization even without active
  federation (see [ADR 0010](0010-server-initialization.md)); they can be used
  to sign tokens in the meantime.
