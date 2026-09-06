# 0004 — Event log and ordering

**Status**: accepted

## Context

Two possible models:

- **CRUD + separate feed**: current state in tables, real time bolted on, catch-up
  by querying the messages table. Simple, but history and federation must be
  designed separately.
- **Event-sourced (Matrix-style)**: the room is a log of immutable events, state
  is a projection. Uniform (live + sync + federation + audit), but complex
  (cross-server state resolution, storage growth, contributor barrier).

## Decision

Hybrid model: **materialized tables for reads + append-only per-room log as the
synchronisation backbone.**

- Current state lives in normal relational tables (`messages`, `memberships`,
  room state) — this is what the application reads constantly.
- Every operation that changes a room's state writes a row in
  `room_events(room_id, seq, type, sender, content jsonb, created_at)`, unique on
  `(room_id, seq)`, `seq` monotonic **per room**.
- Clients stream and catch up from this log (`?since=<seq>`); they do not fold
  anything, the server serves both state and log.
- The tables are a projection rebuildable from the log.
- The home server of a room is **authoritative for ordering**: remote servers
  submit events to the home server, which assigns the `seq`. No hash-linked DAG,
  no state resolution.

## Consequences

- Uniform sync / stream / federation / audit without the full semantics of
  event sourcing.
- An edit writes both the `messages` update and a log event; this double write
  must be transactional.
- The log grows; plan compaction / purge aligned with retention
  (see [ADR 0012](0012-retention-and-tombstones.md)).
- Sync cursor = per-room `seq` (see [ADR 0005](0005-realtime-transport.md)).
