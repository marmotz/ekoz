# Web client direct messages

**Status**: technical design, see [technical.md](./technical.md)

## Context

The protocol has one-to-one (`dm`) and private group (`group_dm`) conversations:
rooms outside the space hierarchy and the directory, with fixed or role-less
membership (`POST /dms`, deduplicated per pair, and `POST /group-dms`), see
[rooms and permissions](../../../docs/protocol/rooms-and-permissions.md#direct-and-group-conversations).
[`web-client-rooms`](../../_archives/features/web-client-rooms/overview.md) explicitly left them out of
scope: the client neither lists nor creates them.

Gaps found while scoping, against the current server:

- No listing of the caller's conversations: `GET /rooms` leaves `dm` /
  `group_dm` out.
- No user search: only `GET /users/:identifier` (exact identifier).
- `group_dm` management is a single creator override (`room.manage_members`),
  with no admin notion, no rename rule, no end-of-life rule.

## Goal

A user can start a direct conversation with another user (in particular from a
room member), create a group conversation, find their conversations in the
sidebar and chat in them with the same message view as rooms.

## Decisions made

- **Scope**: both one-to-one and group conversations.
- **Finding someone**: a "new conversation" picker with a server-side user
  search limited to people the caller shares at least one room with, plus an
  exact-identifier lookup that reaches any user. The member profile
  ([`web-client-members`](../web-client-members/overview.md)) is another entry
  point.
- **Sidebar**: a dedicated "Direct messages" section below the space tree,
  ordered by last activity.
- **Naming**: a one-to-one conversation shows the other person's name and
  avatar; a group shows its name if it has one, otherwise its participants
  (truncated). A group name is optional.
- **Visibility**: a conversation (one-to-one or group) appears for the other
  participants only once it has a first message; an empty conversation is
  visible to its creator only.
- **One-to-one, "delete the conversation"**: a one-to-one conversation cannot
  be left, only hidden; the action is labelled "delete the conversation". It
  reappears when the other person writes again, ideally showing only the
  messages posted after the deletion (older messages stay on the server). If
  that proves too costly, the full history is shown again.
- **Group admins**:
  - The creator is the first admin. Any admin can rename the group, add and
    remove members, and promote or demote admins (other admins included).
  - Adding a member is direct (no invitation to accept). When adding, the
    admin chooses whether the new member sees the past history or only the
    messages posted after they joined.
  - Any member can leave the group.
  - When the last admin leaves, the group is deleted: every member is removed
    and nobody sees its past messages anymore.

## Out of scope

- Unread counts and read markers:
  [`web-client-read-state`](../web-client-read-state/overview.md).
- Notifying new direct messages: [`notifications`](../notifications/overview.md).

## Dependencies

- [`web-client-members`](../web-client-members/overview.md): the member profile is
  an entry point for "send a message".
- [`web-client-chat`](../../_archives/features/web-client-chat/overview.md): message view reused as is.
- [`notifications`](../notifications/overview.md): direct messages are a notifiable
  event, handled there.
- Server side: a conversations listing, a user search, group admin management
  (admin flag, rename, add/remove, deletion on last admin leaving), history
  visibility per added member, and the history cut on a deleted one-to-one
  conversation. Each change updates the protocol pages and the SDK.
