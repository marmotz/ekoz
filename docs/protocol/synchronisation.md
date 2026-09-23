# Synchronisation

Catch-up (`GET /sync`) and real-time delivery (`GET /events`, SSE). This is the
wire contract for `apps/server`'s `conversations` feature, the streaming slice
(issue #11) — a mismatch between this page and `apps/server` is a bug, fixed
here first (see [HTTP API conventions](../technical/api-conventions.md)).

## Conventions

- Error responses are `application/problem+json` with a stable `code`
  (see [HTTP API conventions](../technical/api-conventions.md)).
- Two independent cursors: a room's own `seq`
  (see [event log and ordering](../technical/event-log-and-ordering.md)) for
  `GET /sync`, and a per-account `feedSeq` for `GET /events`'s `Last-Event-ID`.
  They are not comparable to each other — `feedSeq` is a single server-wide
  sequence, not reset per account, so gaps between an account's own rows are
  expected and not a sign of loss.

## `GET /sync`

Per-room catch-up: ordered `room_event`s strictly after a cursor, plus the
room's current `seq` so the caller knows how far behind it still is.

- Query: `?room=<id>&since=&limit=`. `since` defaults to `"0"`. `limit` is
  capped at `sync.max_page` regardless of what is requested.
- Needs `room.read` on `room`.
- `200`: `{ events: RoomEvent[], lastSeq: string }` — `events` is `(since,
  since + limit]` at most, ordered by `seq` ascending; each `RoomEvent` is
  `{ roomId, seq, type, senderId, content, originServer, createdAt }`;
  `lastSeq` is the room's `Room.lastSeq` at response time (may be ahead of the
  last returned event when the page was capped — call again with the last
  event's `seq` as the new `since`).
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`),
  validation (`422`, e.g. a non-numeric `since`).

Used for initial room load (`since` omitted or `"0"`) and reconnection
reconciliation for any room the SSE stream may have missed events on.

## `GET /events`

One SSE stream per client session, multiplexing every room the account is a
member of, plus account-scoped events (invitations, join-request outcomes) and
ephemeral presence/typing signals (see
[Presence and typing](presence-and-typing.md)). Not room-scoped: a single
connection carries everything, distinguished by the SSE `event:` field
(`room_event`, `account`, `presence`, or `typing`).

- Query: `?ticket=<t>` — a single-use ticket from `POST /stream/ticket`
  (identity-and-profiles), not the bearer access token (SSE cannot set an
  `Authorization` header from a browser `EventSource`). `@Public()`: this
  route is not bearer-authenticated.
- `Last-Event-ID` (request header, standard SSE reconnection, browsers replay
  it automatically) or `?lastEventId=` as a fallback: the last `feedSeq` the
  client acked. Only the durable `room_event` / `account` frames replay from
  there — presence and typing are live-only and are simply gone if missed.
  With **neither** given, the stream starts at the current head of the
  account's feed: live frames only, nothing from before the connection is
  replayed. A client that needs history reads `GET /rooms/:id/messages` and
  `GET /sync`.
- `200`: `text/event-stream`. A durable frame's `id:` field is its `feedSeq`
  (decimal string); `data:` is the row's `payload` with `roomId` folded in
  (`{ roomId, ...payload }`) so a `room_event` frame is attributable to its
  room without a second lookup. A `presence` frame's `data:` is `{ userId,
  status }`; a `typing` frame's is `{ roomId, userId, ttl }` — neither carries
  an `id:`.
- Errors (before the stream opens): `auth.unauthenticated` (`401`, missing,
  unknown, already-used or expired ticket).

Delivery for the durable half (`room_event` / `account` frames) is poll-based
for this increment — the server re-reads `AccountFeedEvent` for the connected
account on a short interval rather than pushing on write — the same
"in-process now" simplification the presence store documents. Presence and
typing are pushed live through an in-process broadcaster instead, since they
are never persisted. A keepalive comment (`: keepalive`) is sent periodically
to hold the connection open through a buffering reverse proxy; the server also
sets `X-Accel-Buffering: no` for nginx.

A room event is fanned out to the **effective** members of its room: those with
an explicit `Membership` on it and those of its ancestor spaces, one feed row
per distinct user. A member of a space therefore receives the live events of
its channels without having joined each one. The fan-out checks that a
membership exists, not the `room.read` capability: a `deny` override on
`room.read` is not honoured by the feed (`GET /sync` still enforces it).

The account feed (`AccountFeedEvent`, server-internal) is a fan-out projection
with its own `feedSeq`, populated in the same transaction as the `room_event`
it mirrors (issue #11 folds fan-out directly into `EventLogService.append`,
not a separate async worker as originally sketched) — so a message's
`room_event.seq` is authoritative for room state (`GET /sync`), while
`feedSeq` only orders what one account's stream has seen. The feed table is
pruned server-side by age (rows older than a fixed retention window); pruning
by "every session's acked `feedSeq`" is not implemented — there is no table
tracking a per-session delivery cursor yet, only the client-held
`Last-Event-ID`. `GET /sync` remains the source of truth for anything older
than what the feed retains.
