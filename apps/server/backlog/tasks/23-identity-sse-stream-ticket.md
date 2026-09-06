# server — identity: SSE stream ticket

**Status**: done
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#23](https://github.com/ekoz-chat/server/issues/23)

Reference: [../features/identity-and-profiles/technical.md §12](../features/identity-and-profiles/technical.md#12-sse-stream-ticket),
[ADR 0008](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0008-auth-and-sessions.md).

## To do

1. `POST /stream/ticket` (auth) → `{ ticket, expiresIn }`; `ticket` = 32 random
   bytes, single-use, ~30s TTL.
2. In-process ticket store keyed by hash, bound to `{ userId, sessionId }`, with
   a Redis-backed implementation reserved behind an interface (multi-instance).
3. Expose a `TicketService.consume(ticket)` for the `GET /events` consumer built
   in [conversations](../features/conversations/technical.md#16-sync-and-real-time-delivery).

## Dependencies

- [13-identity-auth-tokens-and-guards](13-identity-auth-tokens-and-guards.md)
