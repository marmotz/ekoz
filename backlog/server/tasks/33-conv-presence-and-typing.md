# server — conversations: presence and typing

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#33](https://github.com/ekoz-chat/server/issues/33)

Reference: [../features/conversations/technical.md §15](../features/conversations/technical.md#15-presence-and-typing).

## To do

1. In-process presence store `Map<userId, { lastBeat, status }>` behind an
   interface (Redis hash implementation reserved for multi-instance).
2. `POST /presence/heartbeat` (optional explicit `away`); status derived from
   `presence.away_after` / `presence.offline_after`.
3. Visibility: a user receives presence for co-members (from `membership`) + DM
   partners; maintain a per-connection subscription set.
4. `POST /rooms/:id/typing` → broadcast a `typing` signal with `typing.ttl`
   expiry; never persisted, never in the event log.
5. Fan-out through the SSE stream.

## Dependencies

- [27-conv-membership](27-conv-membership.md)
- [34-conv-streaming-sync-and-feed](34-conv-streaming-sync-and-feed.md)
