# SDK packaging, distribution and protocol-version policy

## Context

`@ekozhq/sdk` is the first consumer of the REST surface fixed by
[HTTP API conventions](api-conventions.md) and the token / session model of
[authentication and sessions](auth-and-sessions.md). Its
[SDK foundations technical design](../../backlog/features/sdk-foundations/technical.md)
settles a set of choices that shape the public API third-party clients will
bind, how the package is built and distributed, and how a client and a server
negotiate protocol compatibility.

The protocol "Identity and profiles" section is not written yet; until it is, the
SDK sources its wire types from the server code.

## Decision

### Public API shape

- The single entry point is `createClient(config)`, returning one namespaced
  client (`client.auth.*`, `client.me.*`, `client.sessions.*`,
  `client.invitations.*`, `client.admin.*`, …). No free functions, no
  per-resource constructors.

### Error model

- Every `application/problem+json` response ([HTTP API conventions](api-conventions.md))
  is mapped to a typed exception class, keyed off the stable `code`. The class
  hierarchy is stable API; the `code` string remains the discriminator so an
  unknown `code` degrades to a base error rather than breaking callers.

### Session persistence

- The SDK is storage-agnostic. Persistence is delegated to a consumer-provided
  `SessionStore` adapter (get / set / clear). The SDK ships no default that
  touches a specific runtime's storage, keeping it usable in the browser and in
  Bun / Node without conditional exports for storage.

### Session lifecycle events

- The client exposes an `on` / `off` / `once` emitter for session-lifecycle
  events (authenticated, token refreshed, refresh failed / logged out). This is
  how a consumer reacts to background refresh without wrapping every call.

### Build and distribution

- Build: dual **ESM + CJS** output via **tsdown**, with type declarations.
- Distribution: **`link`-only** (local `bun link` / `npm link`) until the public
  surface stabilises. **changesets** is wired up now so version history accrues
  from the start; **npm publish is deferred** until the surface is stable.

### Protocol-version policy

- Every request carries an `X-Ekoz-Protocol` header naming the protocol **major**
  the SDK was built against (currently `0`).
- The SDK runs a compatibility gate: it reads `protocol_versions` from the
  server's discovery document (`GET /.well-known/ekoz`, see
  [discovery.md](../protocol/discovery.md)) and refuses to operate if its own
  major is not offered, surfacing a typed error before any resource call.
- The server side gets a **tolerant reader** for `X-Ekoz-Protocol` (accept a
  compatible major, reject otherwise) under a separate `server` task; this page
  only fixes the contract.

### Wire types

- Until the protocol "Identity and profiles" section exists, the SDK's
  request/response types are sourced from the server code. When that section
  lands it becomes the authoritative source and any mismatch is reconciled in
  `docs/protocol/` first (see [HTTP API conventions](api-conventions.md)).

## Consequences

- The protocol spec's transport section must document the `X-Ekoz-Protocol`
  request header alongside `protocol_versions` in discovery.
- `createClient(config)`, the `SessionStore` interface and the typed-error
  hierarchy are public API: changing them is a breaking SDK release.
- No package is published to npm yet; external integration before then is via
  `link` against a checkout.
- The protocol major and the SDK version move independently; the SDK tracks a
  protocol major, not a server version.
