# Presence and typing

Online/away/offline presence and typing indicators. This is the wire contract
for `apps/server`'s `conversations` feature, the presence slice (issue #10) —
a mismatch between this page and `apps/server` is a bug, fixed here first (see
[HTTP API conventions](../technical/api-conventions.md)).

## Conventions

- Error responses are `application/problem+json` with a stable `code`
  (see [HTTP API conventions](../technical/api-conventions.md)).
- Neither presence nor typing is ever written to the `room_event` log
  (see [event log and ordering](../technical/event-log-and-ordering.md)) or
  persisted at all: both are ephemeral, in-process state, delivered only over
  the SSE stream (see [Synchronisation](synchronisation.md)) via a live
  push — not the durable account feed, so a connection that was down when a
  signal fired has simply missed it; there is no replay.

## Presence

Three states: `online`, `away`, `offline`, derived from the last heartbeat
against two server-configured windows (`presence.away_after`,
`presence.offline_after`): `online` while the last heartbeat is within
`presence.away_after`, `away` until `presence.offline_after`, `offline` after
that. A client may also declare `away` explicitly rather than waiting for the
window to lapse.

**Visibility**: a user receives presence updates only for users they share at
least one room with, plus their `dm` partners (the same relation — a `dm`'s
two `Membership` rows already cover the partner case). The visible-peer set is
computed once when the `GET /events` connection opens; a membership change
made afterwards only takes effect on the next reconnect.

### `POST /presence/heartbeat`

Authenticated. Refreshes the caller's `lastBeat` and returns the resulting
status; expected at `presence.heartbeat_interval`.

- Body: `{ away?: boolean }` — omit or `false` for the heartbeat's default
  online/away/offline recompute; `true` declares the caller away regardless of
  the elapsed time.
- `201`: `{ status: "online" | "away" | "offline" }`.
- Errors: none beyond the standard `auth.unauthenticated` (`401`).

Presence updates are pushed over the SSE stream as `event: presence` frames
(`{ userId, status }`), one per user whose derived status changed and who
shares visibility with the connection — there is no `GET /presence` polling
endpoint.

## Typing

A typing signal is a fire-and-forget broadcast to the room's members, expiring
client-side after `typing.ttl` with no follow-up "stopped typing" call needed.
The server does not track or replay typing state — a client that reconnects
simply sees nothing until someone types again.

### `POST /rooms/:id/typing`

Needs `room.post` (the same capability sending a message needs).

- No body.
- `204`.
- Errors: `room.permission_denied` (`403`).

Delivered over the SSE stream as `event: typing` frames (`{ roomId, userId,
ttl }`) to every member of the room, distinct from `room_event`s: it never
gets a `seq` and is not replayable via `GET /sync`.
