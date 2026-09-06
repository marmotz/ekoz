# server — conversations: sync endpoint, account feed, SSE stream

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#34](https://github.com/ekoz-chat/server/issues/34)

Reference: [../features/conversations/technical.md §16](../features/conversations/technical.md#16-sync-and-real-time-delivery),
[ADR 0005](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0005-realtime-transport.md).

## To do

1. Prisma model: `AccountFeedEvent` (`@@id([userId, feedSeq])`).
2. `GET /sync?room=<id>&since=<seq>&limit=` — ordered `room_event`s `(since, …]`,
   up to `sync.max_page`, plus the room's current `lastSeq`.
3. Fan-out worker: read new `room_event`s → insert a feed row per member with
   `room.read`; insert account-scoped events (invites, join-request outcomes,
   presence) directly.
4. `GET /events?ticket=<t>` — validate via identity's `TicketService`, bind to
   the session, stream `AccountFeedEvent`s; `Last-Event-ID` = last `feedSeq`;
   keepalive comments; `X-Accel-Buffering: no`.
5. Feed pruning (age + below every session's acked `feedSeq`).
6. Require HTTP/2; document proxy config.

## Dependencies

- [25-conv-event-log-and-seq](25-conv-event-log-and-seq.md)
- [27-conv-membership](27-conv-membership.md)
- identity [#23 SSE stream ticket](23-identity-sse-stream-ticket.md)
