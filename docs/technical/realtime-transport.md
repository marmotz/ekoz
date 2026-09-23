# Real-time transport (SSE)

## Context

Options: WebSocket (bidirectional, but a second protocol on top of HTTP, sticky
sessions, reconnection/backfill to reimplement), SSE (server→client over plain
HTTP, native reconnection, unidirectional), long-polling (fallback). Presence
and typing indicators are part of the messaging increment.

## Decision

**SSE (server→client) + REST (client→server). No WebSocket.**

- One SSE stream per client, multiplexing all the user's rooms and account-scoped
  events (notifications, presence of co-members).
- All writes go through REST endpoints: send, edit, react, read receipt, typing,
  presence heartbeat.
- Typing: at most 1 POST every 3-5 s while typing. Presence: heartbeat every
  30-60 s and on tab visibility change; the server derives online / away /
  offline from the last heartbeat.
- Sync cursor: per-room `seq`. The client keeps a `{roomId: seq}` map.
- Reconnection: the SDK runs a `GET /sync?room=&since=<seq>` reconciliation for
  each stale room, then trusts the live stream. The server is not required to
  replay the stream from an arbitrary point.
- Stream authentication: see [authentication and sessions](auth-and-sessions.md) (single-use
  ticket).

## Deployment constraints

- HTTP/2 required (over HTTP/1.1 an SSE stream consumes one of the 6
  per-host connections).
- Disable response buffering on the SSE endpoint at the proxy level
  (`X-Accel-Buffering: no` for nginx, equivalents elsewhere).
- Keepalive comment (`: ping`) every 15-30 s to stop intermediaries from closing
  the idle connection.
- Raise the process file-descriptor limit (`LimitNOFILE`, container ulimits):
  one connection = one descriptor.
- The internal event bus is defined as an interface with an in-process
  implementation; a backplane (PostgreSQL `LISTEN/NOTIFY` then Redis Streams) is
  added only when multiple server instances run.

## Consequences

- A single protocol: HTTP. No bidirectional connection state to manage.
- ~1000 idle SSE connections are not a bottleneck for a Node/Bun runtime (a few
  MB, event loop). The real cost is the fan-out on events, proportional to
  active users — identical to WebSocket.
- The SDK carries the reconnection logic (jittered backoff) and the
  reconciliation.

## Implementation notes (issues #10-#11)

Two deviations from the plan above, both deliberate simplifications for this
increment rather than design changes:

- **Durable delivery is poll-based, not push.** `GET /events` re-reads
  `AccountFeedEvent` for the connected account on a 1s `setInterval` instead of
  the fan-out writer notifying the open connection directly. A true push would
  need the notification to fire only *after* the write's transaction commits
  (the fan-out happens inside `EventLogService.append`'s transaction, which the
  connection has no visibility into until it commits) — a correct in-process
  `EventEmitter` bridge for that is more machinery than this increment's
  traffic needs. `GET /sync` is still the source of truth either way, so the
  ~1s added latency does not change the client contract.
- **Fan-out is synchronous, inside the same transaction as the `room_event`
  write** (`EventLogService.append` calls `FeedFanoutService.fanOutRoomEvent`
  directly), not the separate async worker this page and
  [Synchronisation](../protocol/synchronisation.md) originally sketched. This
  couples message-send latency to the fan-out's cost (proportional to a room's
  member count) instead of isolating it — acceptable at this increment's
  scale; splitting it into a real worker is a candidate change if fan-out cost
  becomes measurable on the write path.

The presence/typing half **is** pushed live, through the in-process event bus
this page already called for (`EphemeralBroadcaster`) — that part matches the
original design as planned.

## Fan-out scope and cost (web chat server tasks)

The synchronous fan-out targets the **effective** members of a room: explicit
`Membership` rows on the room plus those of its ancestor spaces (resolved
through `room_closure`, one feed row per distinct user). Alternatives rejected:
a client-side `/sync` fallback for inherited rooms (no unseen state, no
catch-up on the stream) and explicit memberships in every channel (duplicates
the permission model).

Consequences:

- The cost of `fanOutRoomEvent`, which runs inside the transaction of the event
  append, is now proportional to the effective members (every member of the
  ancestor spaces), not only to the explicit ones. A message in a channel of a
  large space writes one feed row per space member. The asynchronous worker
  named above remains the evolution if that becomes measurable.
- The fan-out checks that a membership exists, not the `room.read` capability:
  a `deny` override on `room.read` is not honoured (unchanged limitation).
- Feed volume grows accordingly; pruning is unchanged.
- `GET /events` without a cursor starts at the current head of the feed, so a
  fresh connection does not replay the retained feed (see
  [Synchronisation](../protocol/synchronisation.md)).
