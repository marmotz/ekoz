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
