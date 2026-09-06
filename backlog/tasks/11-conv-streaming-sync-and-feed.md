# server — conversations: sync endpoint, account feed, SSE stream

**Status**: todo
**Type**: backend
**Issue**: [#11](https://github.com/marmotz/ekoz/issues/11)

Reference: [../features/conversations/technical.md §16](../features/conversations/technical.md#16-sync-and-real-time-delivery),
[real-time transport](../../docs/technical/realtime-transport.md).

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

- 2-conv-event-log-and-seq (done — `tasks/done/server-2-conv-event-log-and-seq.md`)
- 4-conv-membership (done — `tasks/done/server-4-conv-membership.md`)
- identity SSE stream ticket (done — `tasks/done/server-23-identity-sse-stream-ticket.md`)
