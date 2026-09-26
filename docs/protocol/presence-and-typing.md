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

Three states: `online`, `away`, `offline`. State is kept **per client
instance**: a heartbeat carries an optional `clientId` (1-64 characters, one
per tab or device) and a flag saying whether that instance is idle. The status
of a user is derived from all their instances at the time of evaluation, against
two server-configured windows (`presence.away_after`, `presence.offline_after`):

1. no instance has beaten within `presence.offline_after` → `offline`;
2. the user chose to appear away (see `PUT /presence/preference`) → `away`;
3. an instance that is not idle has beaten within `presence.away_after` →
   `online`;
4. otherwise → `away`.

Heartbeats without a `clientId` share one default instance.

**Visibility**: a user receives presence updates only for users they share at
least one room with, plus their `dm` partners (the same relation, a `dm`'s two
`Membership` rows already cover the partner case). The set of visible peers is
evaluated when a status is emitted, so a membership change takes effect without
reconnecting.

**Emission**: a `presence` frame is pushed only when the derived status of a
user *changes*, whatever the cause: a heartbeat, a change of the manual away
preference, or a window that lapses (the server re-evaluates statuses every few
seconds, so a lapse is noticed within about 5 s past the window). A heartbeat
that leaves the status as it was pushes nothing.

**Snapshot**: when the stream opens, the server writes one `presence` frame per
visible peer whose status is not `offline`, after the connection is subscribed.
A client treats a user it has no frame for as `offline`, and clears what it holds
when it reconnects, since the snapshot of the new connection refills it.

### `POST /presence/heartbeat`

Authenticated. Records a heartbeat for one client instance and returns the
resulting status of the caller and the timing settings the client should follow.

- Body: `{ away?: boolean, clientId?: string }`. `away: true` declares this
  instance idle (no recent user activity), `false` or omitted declares it active.
  `clientId` is 1-64 characters.
- `201`: `{ status: "online" | "away" | "offline", manualAway: boolean,
  heartbeatInterval: number, typingTtl: number }`. `heartbeatInterval` is the
  number of seconds between two heartbeats (`presence.heartbeat_interval`) and
  `typingTtl` the lifetime in seconds of a typing signal (`typing.ttl`); both are
  read from the configuration at each call, so a change is picked up on the next
  beat. `manualAway` is how a client learns of a manual away change made from
  another device.
- Errors: `auth.unauthenticated` (`401`), `validation.failed` (`422`, `clientId`
  empty or longer than 64 characters).

### `PUT /presence/preference`

Authenticated. Persists the manual "appear away" preference of the caller, which
survives a new login. With it set, the derived status is `away` whenever the user
is not `offline`.

- Body: `{ manualAway: boolean }`.
- `200`: `{ status, manualAway }`, the resulting status of the caller.
- Errors: `auth.unauthenticated` (`401`), `validation.failed` (`422`).

Presence updates are pushed over the SSE stream as `event: presence` frames
(`{ userId, status }`). There is no `GET /presence` polling endpoint.

## Typing

A typing signal is a fire-and-forget broadcast to the room's effective members
(those with a membership on the room and those of its ancestor spaces), expiring
client-side after `typing.ttl` with no follow-up "stopped typing" call needed.
The set of recipients is evaluated when the signal is sent. The sender does not
receive its own signal. A client should send at most one signal per room every
`typingTtl / 2` seconds while the user types.
The server does not track or replay typing state — a client that reconnects
simply sees nothing until someone types again.

### `POST /rooms/:id/typing`

Needs `room.post` (the same capability sending a message needs).

- No body.
- `204`.
- Errors: `room.permission_denied` (`403`).

Delivered over the SSE stream as `event: typing` frames (`{ roomId, userId,
ttl }`) to every effective member of the room except the sender, distinct from `room_event`s: it never
gets a `seq` and is not replayable via `GET /sync`.
