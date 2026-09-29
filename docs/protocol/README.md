---
slug: /
---

# Ekoz protocol

The Ekoz protocol is the exchange contract between clients and servers, and between
servers. It is versioned with [SemVer](https://semver.org/), independently of any
server implementation, and this section is written for anyone building a client, a
server or a bridge against it. Every change is listed in the [changelog](CHANGELOG.md).

## Principles

- **Transport**: HTTP(S) only, TLS mandatory.
- **Client to server**: a REST/JSON API.
- **Server to client**: one Server-Sent Events (SSE) stream per client, multiplexing
  every room the account belongs to and account-scoped events. See
  [Synchronisation](synchronisation.md).
- **Server to server**: a signed REST/JSON API (Ed25519), with discovery through
  `/.well-known/ekoz`. See [Discovery](discovery.md).
- **Errors**: `application/problem+json` (RFC 9457) with a stable, domain-namespaced
  `code` such as `room.not_found`. Technical error messages are in English.
- **Identifiers**: ULID (an opaque 26-character string). Timestamps are UTC ISO-8601.
  The only exception is the user-facing account identifier, `name/server`.
- **Protocol version**: every client request carries an `X-Ekoz-Protocol` header naming
  the protocol **major** it was built against (currently `0`). A client checks its major
  against `protocol_versions` in the [discovery document](discovery.md) before issuing
  resource calls, and a server rejects a request whose major it cannot serve.

## Event model

- Each room has an ordered log of events identified by a `seq`, monotonic **per room**.
- The home server of a room is authoritative for assigning `seq` values.
- Catch-up is `GET /sync?room=&since=<seq>`; the SSE stream carries the same events in
  real time. See [Synchronisation](synchronisation.md).

## Core objects

- **Identity**: `name/server`. See [Identity and profiles](identity.md).
- **Room**, with a `type` of `space`, `channel`, `dm` or `group_dm`. See
  [Spaces, rooms, roles and permissions](rooms-and-permissions.md).
- **Message**, with reactions, pins and read markers. See
  [Messages and interactions](messages-and-interactions.md).
- **Attachment** and link preview. See [Files and sharing](files-and-sharing.md).
- The set of room event types is additive-only: clients must ignore types they do not
  know.

## Reading order

1. [Discovery](discovery.md): find a server and verify what it signs.
2. [Identity and profiles](identity.md): set up, register, sign in, manage sessions.
3. [Spaces, rooms, roles and permissions](rooms-and-permissions.md): the conversation
   structure and the permission model.
4. [Messages and interactions](messages-and-interactions.md): the message lifecycle.
5. [Files and sharing](files-and-sharing.md): uploads, downloads, link previews.
6. [Synchronisation](synchronisation.md) and [Presence and typing](presence-and-typing.md):
   real-time delivery.

## Not specified yet

Notifications, administration and audit, server-to-server federation and extensions
with fallback rendering are not covered by this version of the specification.
