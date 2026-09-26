# Web client direct messages

## Context

`apps/client-web` could open spaces and channels, but had no way to talk to a person or a
small group. The server already created `dm` and `group_dm` rooms (`POST /dms`,
`POST /group-dms`), yet nothing listed them, found people to start one with, or let a group
be managed. Checking the product scoping against the code showed why the message view alone
was not enough:

- `GET /rooms` only lists spaces and channels, and `useRoomAccess` resolves a room from that
  list, so a `dm` link ended as "unavailable";
- the group creator held a `room.manage_members` override that only gated join requests: the
  "admin" could rename, add or remove nobody;
- message reads and `GET /sync` only checked `room.read`, so a member always read the whole
  history, and "delete the conversation" only set `Membership.hiddenAt`, which nothing read;
- `POST /dms` never checked that the target user existed or was active, and the public profile
  had no `id` to start a conversation from.

The feature-level design is in
[`backlog/features/web-client-direct-messages/technical.md`](../../backlog/features/web-client-direct-messages/technical.md);
this page records what shipped and why. It builds on [web client rooms](web-client-rooms.md),
[web client chat](web-client-chat.md), the [permission model](permission-model.md) and the
[rooms and permissions protocol](../protocol/rooms-and-permissions.md).

## Decision

### Server and protocol

Every endpoint is described in [rooms-and-permissions.md](../protocol/rooms-and-permissions.md)
and listed in [`docs/protocol/CHANGELOG.md`](../protocol/CHANGELOG.md); the SDK types are
generated from `apps/server/openapi.json` and exposed as `client.conversations`.

- `GET /me/conversations` lists the caller's `dm` and `group_dm`, newest activity first, with
  the other participants and the admin flags, so the client names a conversation without one
  request per room.
- `GET /me/contacts` searches the users sharing a room with the caller. The public profile
  carries `id` so an exact `name/server` lookup can start a conversation.
- Group management lives in dedicated `/group-dms/:id/*` endpoints (rename, add and remove
  members, promote and demote admins), and a group left without an admin is deleted.
- A membership can carry a **history floor** (`historyFromSeq`): message reads, pins,
  `GET /sync` and the message actions hide what precedes it. It is raised when a `dm` member
  deletes the conversation and when a member is added to a group without its past.

### Routes and gate

- `/dms/new`: the picker. `/dms/$roomId`: the conversation. `/dms/$roomId/settings`: the group
  settings, under the same gate and header. `/dms` opens the picker.
- `ConversationGate` resolves access from the cached conversations list, then falls back to
  `GET /rooms/:id` (a recipient following a link before the first message, or a stale list).
  A `403` / `404`, or a room that is not a conversation, is "conversation not available".
  Capabilities come from `GET /rooms/:id/my-permissions`.
- The route composes `RoomChat` (from `features/chat`) as the rooms route does: a feature may
  not import another. `/rooms/$roomId` redirects to `/dms/$roomId` when the room is a `dm` or
  `group_dm`, keyed on the room type only.

### Sidebar, freshness and unseen dot

The `direct-messages` section registers itself below the rooms tree. The conversations list
refetches on window focus and after every mutation of the feature. `ConversationsLive`, mounted
by the `_app` layout, refetches it from the stream: a message in a room known to neither the
conversations nor the rooms list (a new or reappearing conversation), room, member and
permission events on a listed conversation, `room_deleted` and reconnection. A `room_created`
of a `group_dm` refetches the list, since every member sees a new group from its creation; one of
a `dm` is ignored, since a `dm` only shows for its recipient from its first message. When the open
conversation is deleted, or the caller is removed from it, the page goes home with a toast.

`GET /me/conversations` carries no unread count, so the sidebar dot is a session-only in-memory
mark set by a foreign `message_created` on a conversation that is not being read, and cleared
when the conversation is opened.

### Picker and settings

The picker searches the contacts from two characters (debounced 250 ms). When the input has the
`name/server` shape it also looks the exact profile up and lists it first; an input containing
`@` is never looked up, because `GET /users/:identifier` also resolves email addresses. One
person starts a `dm`, two or more create a group with an optional name. `StartConversationButton`
does the get-or-create for a member profile.

The group admin is a member holding a `room.manage_members` allow override. The settings page
gates rename, add, remove and promote or demote on that capability. Every member can leave; when
the caller is the only admin, leaving or giving up the role warns that the group will be deleted
for everyone.

## Alternatives considered

| Point | Retained | Rejected | Why |
|-------|----------|----------|-----|
| Admin storage | Existing user override `room.manage_members` | A `Membership.isAdmin` column, a new role | Already the documented "light `room_admin`", no migration, visible through `my-permissions`; a column adds a second authorization path. |
| Group management routes | Dedicated `/group-dms/:id/*` | Generic `PATCH /rooms/:id` and `DELETE /rooms/:id/members/:userId` | The generic routes check `space.manage` and `room.kick`, which must not be widened for groups. |
| History limits | One per-member floor for both "added without history" and "deleted `dm`" | Hide-only delete, or one mechanism per case | One mechanism gives the preferred behaviour for both. |
| Conversation UI | Own routes and gate | Extending `RoomGate` and `/rooms/$roomId` | `useRoomAccess` is built around the space tree; a separate gate keeps both simple. |
| Unseen state | In-memory client mark | An unread count in `GET /me/conversations` | The read-state counters are per room from `GET /rooms`; a demonstration client does not need a second server counter. |

## Consequences

- Members with a floor no longer read older messages through the API. It only affects rows
  written by this feature (the floor starts `null`).
- The hidden-message id on the stream reveals that an old message was edited or reacted to, not
  its content.
- Deleting a group is irreversible for its members; its messages remain in the database until
  retention or a purge. Account deletion of the last admin is not handled: the group then keeps
  members with no admin.
- `GET /me/conversations` is unpaginated and embeds up to 49 participants per group; revisit if a
  user holds hundreds of conversations.
- The sidebar dot does not survive a reload.
- A deleted room now answers `404` to every caller, including its former members, instead of
  `403`.
