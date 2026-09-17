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
  account-scoped events (see [real-time transport](../technical/realtime-transport.md)).
- Server → server: signed REST/JSON API (Ed25519), discovery via
  `/.well-known/ekoz` (see [discovery.md](discovery.md) and
  [federation protocol](../technical/federation-protocol.md)).
- Technical error messages in English.
- Error responses: `application/problem+json` (RFC 9457) with a stable
  domain-namespaced `code` (see [HTTP API conventions](../technical/api-conventions.md)).
- Entity identifiers: ULID (opaque 26-char string; see
  [entity identifier format](../technical/entity-identifier-format.md)). Timestamps:
  UTC ISO-8601.
- Protocol version: every client request carries an `X-Ekoz-Protocol` header
  naming the protocol **major** it was built against (currently `0`). A client
  checks its major against `protocol_versions` in the discovery document
  ([discovery.md](discovery.md)) before issuing resource calls; a server rejects
  a request whose major it cannot serve (see
  [SDK packaging and protocol-version policy](../technical/sdk-packaging-and-protocol-policy.md)).

## Event model

- Each room has an ordered log: events identified by a `seq` monotonic **per
  room**.
- The home server of a room is authoritative for assigning `seq` values.
- Synchronisation: `GET /sync?room=&since=<seq>`. The SSE stream carries the same
  events in real time. See [Synchronisation](synchronisation.md) for the full
  contract, and [event log and ordering](../technical/event-log-and-ordering.md)
  for the design behind it.

## Core objects

- Identity: `name/server` (see [user identifier](../technical/user-identifier.md)).
- `room` with `type`: `space` | `channel` | `dm` | `group_dm`
  (see [conversation data model](../technical/conversation-data-model.md) and
  [Spaces, rooms, roles and permissions](rooms-and-permissions.md)).
- `message` (see [Messages and interactions](messages-and-interactions.md)),
  `attachment` (not specified yet), `membership` (not specified yet).
- Log event types: see the "Room events" table on each section page above; the
  full `RoomEventType` enum is additive-only.

## Sections written

- [Identity and profiles](identity.md): setup, registration (open / invite /
  admin), login / refresh / logout, sessions, email verification, password
  reset, own and public profiles, invitations, owner administration — method,
  path, request body, success shape and `problem+json` codes for each.
- [Spaces, rooms, roles and permissions](rooms-and-permissions.md): room
  hierarchy CRUD and move, the capability ACL and its resolver, and the
  `room_*` / `permission_override_changed` event payloads — method, path,
  request body, success shape and `problem+json` codes for each. Fully
  implemented server-side (issues #1-#3).
- [Messages and interactions](messages-and-interactions.md): send / edit /
  delete, restricted-Markdown grammar, structured mentions, replies, pins,
  reactions, read markers, and their `room_event` payloads. **Draft** —
  transcribed from the settled technical design ahead of the server
  implementation (issues #7-#9); reconciled against real behaviour once they
  ship.
- [Presence and typing](presence-and-typing.md): heartbeat-derived presence,
  visibility rules, ephemeral typing signals. **Draft**, ahead of issue #10.
- [Synchronisation](synchronisation.md): `GET /sync` per-room catch-up,
  `GET /events` SSE stream, the per-account feed and its `feedSeq` cursor.
  **Draft**, ahead of issue #11.

## Sections to write

1. Authentication and sessions (SSE ticket; the rest moved to
   [Identity and profiles](identity.md)).
2. Files and blobs.
3. Notifications.
4. Administration and audit.
5. Discovery and server↔server federation.
6. Extensions and fallback rendering.
