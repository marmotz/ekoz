# Synchronisation

Catch-up (`GET /sync`) and real-time delivery (`GET /events`, SSE). This is the
wire contract for `apps/server`'s `conversations` feature, the streaming slice
(issue #11) — a mismatch between this page and `apps/server` is a bug, fixed
here first (see [HTTP API conventions](../technical/api-conventions.md)).
**Draft ahead of implementation**: issue #11 has not landed yet; this page
transcribes the settled design from
`backlog/features/conversations/technical.md` §16 and
[real-time transport](../technical/realtime-transport.md) so clients can be
built against it, and gets corrected against the real server the day it ships.

## Conventions

- Error responses are `application/problem+json` with a stable `code`
  (see [HTTP API conventions](../technical/api-conventions.md)).
- Two independent cursors: a room's own `seq`
  (see [event log and ordering](../technical/event-log-and-ordering.md)) for
  `GET /sync`, and a per-account `feedSeq` for `GET /events`'s `Last-Event-ID`.
  They are not comparable to each other.

## `GET /sync`

Per-room catch-up: ordered `room_event`s strictly after a cursor, plus the
room's current `seq` so the caller knows how far behind it still is.

- Query: `?room=<id>&since=<seq>&limit=`. `limit` is capped at
  `sync.max_page` (not yet exposed to clients) regardless of what is
  requested.
- Needs `room.read` on `room`.
- `200`: `{ events: RoomEvent[], roomSeq: string }` — `events` is `(since,
  since + limit]` at most, ordered by `seq` ascending; `roomSeq` is the room's
  `Room.lastSeq` at response time (may be ahead of the last returned event when
  the page was capped — call again with the last event's `seq` as the new
  `since`).
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`),
  validation (`422`, e.g. a non-numeric `since`).

Used for initial room load (`since` omitted or `0`) and reconnection
reconciliation for any room the SSE stream may have missed events on.

## `GET /events`

One SSE stream per client session, multiplexing every room the account can
read plus account-scoped events (invitations, presence — see
[Presence and typing](presence-and-typing.md)). Not room-scoped: a single
connection carries everything, distinguished by an event field naming its
room (or `account` for account-scoped events).

- Query: `?ticket=<t>` — a short-lived ticket from
  `POST /stream/ticket` (identity-and-profiles), not the bearer access token
  (SSE cannot set an `Authorization` header from a browser `EventSource`).
- `Last-Event-ID` (request header, standard SSE reconnection): the last
  `feedSeq` the client acked. On reconnect the server *may* replay recent feed
  rows from that point, but this is best-effort, not a guarantee — the
  client's contract is to reconcile any room it suspects went stale via
  `GET /sync`, using the stream only as a live-update signal.
- `200`: `text/event-stream`. Each event's `id` field is its `feedSeq`
  (decimal string); `data` is the event payload (a `room_event` wrapped with
  its `roomId`, or an account-scoped payload with `kind`).
- Errors (before the stream opens): `auth.unauthenticated` (`401`, invalid or
  expired ticket).

The account feed (`AccountFeedEvent`, server-internal) is a fan-out projection
with its own `feedSeq`, populated asynchronously after a `room_event` commits
— so a message's `room_event.seq` is authoritative for room state
(`GET /sync`), while `feedSeq` only orders what one account's stream has seen,
and the two numbers are never compared to each other. The feed table is
pruned server-side (age or every session's acked `feedSeq`, whichever is more
permissive); `GET /sync` remains the source of truth for anything older than
what the feed retains.
