# 0012 — Retention and tombstones

**Status**: accepted

## Context

Retention is defined by default at the server level, overridable per space or
room (permissions required). On expiry, each rule chooses between hiding and
deletion. The `room_events` log has a monotonic `seq` per room: a plain `DELETE`
leaves a gap and breaks the client's "have I received everything?" check.

## Decision

- **Hiding**: the message is removed from the UI, the `messages` row and the
  content stay in the database (reversible, visible to moderation). The log event
  carries a `hidden` flag.
- **Deletion**: the actual content is erased from the database (message body,
  attachment dereferencing, author metadata). The corresponding `room_events`
  entry becomes a **tombstone**: `{type: "redacted", content: null, reason,
  redacted_at}`. The `seq` position is kept as an empty marker.
- Manual edit and deletion by the author follow the same logic: a visible event
  flags the action without exposing the previous content.
- In federation, the tombstone is replicated ("redact `seq` N").

## Consequences

- No `seq` gap; incremental synchronisation stays verifiable.
- "Erased from the database" covers all real data; only a contentless audit
  marker remains.
- Log compaction may group sequences of old tombstones, without ever
  reintroducing a gap observable by an up-to-date client.
