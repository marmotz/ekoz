# Presence and typing

Online/away/offline presence and typing indicators. This is the wire contract
for `apps/server`'s `conversations` feature, the presence slice (issue #10) —
a mismatch between this page and `apps/server` is a bug, fixed here first (see
[HTTP API conventions](../technical/api-conventions.md)). **Draft ahead of
implementation**: issue #10 has not landed yet; this page transcribes the
settled design from `backlog/features/conversations/technical.md` §15 so
clients can be built against it, and gets corrected against the real server
the day it ships.

## Conventions

- Error responses are `application/problem+json` with a stable `code`
  (see [HTTP API conventions](../technical/api-conventions.md)).
- Neither presence nor typing is ever written to the `room_event` log
  (see [event log and ordering](../technical/event-log-and-ordering.md)) or
  persisted at all: both are ephemeral, in-process state, delivered only over
  the SSE stream (see [Synchronisation](synchronisation.md)).

## Presence

Three states: `online`, `away`, `offline`, derived from the last heartbeat
against two server-configured windows (`presence.away_after`,
`presence.offline_after` — not yet exposed to clients): `online` while the last
heartbeat is within `presence.away_after`, `away` until
`presence.offline_after`, `offline` after that. A client may also declare
`away` explicitly rather than waiting for the window to lapse.

**Visibility**: a user receives presence updates only for users they share at
least one room with, plus their `dm` partners — not a global roster.

### `POST /presence/heartbeat`

Authenticated. Refreshes the caller's `lastBeat`; expected at
`presence.heartbeat_interval` (not yet exposed to clients).

- Body: `{ status?: "online" | "away" }` — omit for the heartbeat's default
  `online` recompute; pass `"away"` to declare it explicitly.
- `204`.
- Errors: none beyond the standard `auth.unauthenticated` (`401`).

Presence updates are pushed over the SSE stream as account-scoped events (not
room-scoped), one per user whose derived status changed and who shares
visibility with the connection — there is no `GET /presence` polling endpoint.

## Typing

A typing signal is a fire-and-forget broadcast to the room's members, expiring
client-side after `typing.ttl` (not yet exposed to clients) with no
follow-up "stopped typing" call needed. The server does not track or replay
typing state — a client that reconnects simply sees nothing until someone
types again.

### `POST /rooms/:id/typing`

Needs to be a member.

- No body.
- `204`.
- Errors: `room.not_found` (`404`).

Delivered over the SSE stream as a room-scoped signal, distinct from
`room_event`s: it never gets a `seq` and is not replayable via `GET /sync`.
