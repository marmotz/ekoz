# Ekoz protocol

The exchange contract between clients and servers, and between servers. Versioned
with SemVer, independently of the server implementation. See
[CHANGELOG.md](CHANGELOG.md).

> Status: skeleton. The detail will be written feature by feature, alongside the
> technical design of the server (`server`) and the SDK (`sdk-js`).

## Principles

- Transport: HTTP(S) only. TLS mandatory.
- Client → server: REST/JSON API.
- Server → client: one **SSE** stream per client, multiplexing rooms and
  account-scoped events (see [ADR 0005](../technical/adr/0005-realtime-transport.md)).
- Server → server: signed REST/JSON API (Ed25519), discovery via
  `/.well-known/ekoz` (see [ADR 0006](../technical/adr/0006-federation-protocol.md)).
- Technical error messages in English.
- Error responses: `application/problem+json` (RFC 9457) with a stable
  domain-namespaced `code` (see [ADR 0017](../technical/adr/0017-api-conventions.md)).
- Entity identifiers: UUID v7. Timestamps: UTC ISO-8601.

## Event model

- Each room has an ordered log: events identified by a `seq` monotonic **per
  room**.
- The home server of a room is authoritative for assigning `seq` values.
- Synchronisation: `GET /sync?room=&since=<seq>`. The SSE stream carries the same
  events in real time.
- See [ADR 0004](../technical/adr/0004-event-log-and-ordering.md).

## Core objects (to be specified)

- Identity: `name/server` (see [ADR 0007](../technical/adr/0007-user-identifier.md)).
- `room` with `type`: `space` | `channel` | `dm` | `group_dm`
  (see [ADR 0003](../technical/adr/0003-conversation-data-model.md)).
- `message`, `attachment`, `reaction`, `receipt`, `membership`, presence and
  typing events.
- Log event types: messages, edits, redactions/tombstones, membership and role
  changes, room state changes.

## Sections to write

1. Authentication and sessions (tokens, refresh, SSE ticket).
2. Identity and profiles.
3. Spaces, rooms, roles and permissions.
4. Messages and interactions (replies, reactions, mentions, read receipts).
5. Presence and typing.
6. Files and blobs.
7. Notifications.
8. Administration and audit.
9. Discovery and server↔server federation.
10. Extensions and fallback rendering.
