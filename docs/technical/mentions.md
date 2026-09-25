# Mentions

## Context

A message used to carry a flat list of mentioned user ids (`message_mention`,
`mentions: string[]`). That could neither say where a mention sits in the body,
nor express a mention of a whole room, a role or a named group, and it only
accepted users with an **explicit** membership on the room, so a member of the
parent space could not be mentioned in a channel they read through inheritance.

The [web client mentions](../../backlog/features/web-client-mentions/technical.md)
design needs all of that, plus unread counters and a "My mentions" list. The wire
contract is in [messages and interactions](../protocol/messages-and-interactions.md#mentions)
and [rooms and permissions](../protocol/rooms-and-permissions.md#room-groups).

## Decision

A message has **targets** and an **audience**.

- A **target** is what the author wrote: a `type` (`user`, `all`, `role`,
  `group`), an id when the type needs one, and the **token**, the literal body
  text standing for it (`@name/server`, `@all`, `@<role>`, `@<group name>`).
  Stored in `message_mention_target`, one row per `(message, type, target)`.
- The **audience** is who the message concerns, one row per
  `(message, type, target, user)` in `message_mention_recipient`, carrying the
  `seq` of the event that created the target: the message's own `seq` at send
  time, the `message_edited` event's `seq` for a target added by an edit.

Both are **frozen** when the target is created:

- the token is computed once, so renaming a user or a group, or deleting a group,
  never breaks the association between a token and a target: clients find a
  mention by matching its token in the body;
- the audience is computed once, so someone joining the room later is not added
  and someone leaving does not disappear from history.

"Concerns me" is at least one audience row for the caller, "direct" is one of
them coming from a `user` target, "unread" is one of them above the caller's read
marker. A mention added by editing an old message therefore counts as new, since
its audience `seq` is the edit's.

The audience is resolved from the **effective members** of the room (explicit
memberships of the room and of its ancestor spaces, nearest role winning). That
query is one shared provider, `EffectiveMembersQuery`, also used by
`GET /rooms/:id/members` and the account feed fan-out, so all three agree.

`mentionsMe` is per viewer, so it is added to REST responses and never to a room
event: `/sync` and the SSE feed replay shared `room_event` rows and cannot carry a
per-viewer field consistently. Clients derive it from the targets for live events.

### Room groups

A group is a named set of users defined on a node (`room_group`,
`room_group_member`) and mentioned as `@<name>`. Names are unique over the whole
ancestor and descendant chain of the node, so a token never resolves to two
groups; moving a room re-checks that. `all` and the five role names are reserved.
Members are re-intersected with the effective members when a mention is resolved,
and removed from the groups of a node when they leave, are kicked or are banned.
`room.manage_groups` is a new capability, granted to `space_admin` and
`room_admin`, so no data migration is needed: the seeder upserts the defaults.

### Unread counters and "My mentions"

`GET /me/mentions/unread` counts distinct unread messages per room and
`GET /me/mentions` lists them, newest mention first. Both read the frozen
audience, filter out redacted and hidden messages, deleted rooms and rooms the
caller can no longer read, and cover every room type (`GET /rooms` does not list
`dm` and `group_dm`, so the counters are not a field of it).

The list is ordered by the time of the event that created the caller's audience
row (the message, or the edit that added the mention), not by `seq`: `seq` is per
room and says nothing across rooms. The opaque cursor is that time plus the
message id. A page is refilled when a room was skipped for lack of `room.read`.

## Alternatives considered

- **A Markdown link with an `ekoz:` scheme in the body.** Exact position match,
  but it changes the body grammar and makes the body opaque to other clients.
- **Additive fields with no token.** A renamed user's mention is no longer
  recognised in the body.
- **Computing the audience at read time.** There is no membership history, so
  "effective members at send time" could not be answered.
- **A per-viewer field on the event.** Not consistent with the shared
  `room_event` rows replayed by `/sync`.

## Consequences

- Breaking wire change (`mentions` is now `{ type, target, token }[]`), accepted
  because the protocol is a draft and `@ekozhq/sdk` is `0.0.0`.
- The migration backfills every existing `message_mention` row as a `user` target
  (token `@` plus the current identifier, `@deleted` for a gone account) with one
  recipient at the message's `seq`, then drops the old table. The author is left
  out of the audience, as for new messages.
- A collective mention writes one audience row per effective member: the cost is
  proportional to the room size, paid once at send or edit time.
- Unread counts only decrease for an inherited space member once read markers
  are extended to effective members (`web-client-read-state`).
