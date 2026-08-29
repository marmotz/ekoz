# spec — protocol: conversations sections

**Status**: todo
**Type**: docs
**Repo**: ekoz-chat/spec
**Issue**: [#1](https://github.com/ekoz-chat/spec/issues/1)

Reference: [../features/conversations/technical.md](../features/conversations/technical.md),
[docs/protocol/README.md](../../docs/protocol/README.md).

## To do

1. Write the protocol sections: "Spaces, rooms, roles and permissions",
   "Messages and interactions", "Presence and typing", and the "Synchronisation"
   part covering `GET /sync` and the `GET /events` feed.
2. Document the capability list, `RoomEventType` payloads, the per-room `seq` and
   the per-account `feedSeq`, restricted-Markdown grammar, structured mentions.
3. Update `docs/protocol/CHANGELOG.md`.
4. Keep in sync with the server implementation tasks as they land.

## Dependencies

- Tracks the server conversations tasks; can start once
  [25-conv-event-log-and-seq](25-conv-event-log-and-seq.md) and
  [26-conv-permission-model](26-conv-permission-model.md) are settled.
