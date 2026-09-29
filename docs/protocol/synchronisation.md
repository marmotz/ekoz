# Synchronisation

Catch-up (`GET /sync`) and real-time delivery (`GET /events`, SSE). This page is the
wire contract for the streaming surface of an Ekoz server.

## Conventions

- Error responses are `application/problem+json` with a stable `code`
  (RFC 9457).
- Two independent cursors: a room's own `seq` for
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
- A member with a [history floor](rooms-and-permissions.md#history-floor) never
  receives events older than it: `since` is raised to `floor - 1` when lower.
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
- Snapshot: right after the connection is subscribed, one `presence` frame is
  written per visible peer whose status is not `offline` (see
  [Presence and typing](presence-and-typing.md)). It is a live frame like any
  other `presence` frame: no `id:`, not replayed.
- Errors (before the stream opens): `auth.unauthenticated` (`401`, missing,
  unknown, already-used or expired ticket).

Presence and typing frames are live-only and never persisted. A keepalive
comment (`: keepalive`) is sent periodically to hold the connection open through a buffering reverse proxy; the server also
sets `X-Accel-Buffering: no` for nginx.

A room event is fanned out to the **effective** members of its room: those with
an explicit `Membership` on it and those of its ancestor spaces, one feed row
per distinct user. A member of a space therefore receives the live events of
its channels without having joined each one. The fan-out checks that a
membership exists, not the `room.read` capability: a `deny` override on
`room.read` is not honoured by the feed (`GET /sync` still enforces it).

The per-account feed is a fan-out projection of the room logs with its own
`feedSeq`, written together with the `room_event` it mirrors. A message's
`room_event.seq` is therefore authoritative for room state (`GET /sync`), while
`feedSeq` only orders what one account's stream has seen. The feed is pruned by
age: `GET /sync` remains the source of truth for anything older than what the
feed retains.
