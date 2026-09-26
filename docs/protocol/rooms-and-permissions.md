# Spaces, rooms, roles and permissions

Room hierarchy, membership lifecycle, direct/group conversations, the public
directory, capability ACL and their event-log surface. This is the wire
contract for `apps/server`'s `conversations` feature (issues #1-#6); a
mismatch between this page and `apps/server` is a bug, fixed here first (see
[HTTP API conventions](../technical/api-conventions.md)).

Messages/reactions/receipts, presence/typing and synchronisation each have
their own sibling page: [Messages and interactions](messages-and-interactions.md)
(#7-#9), [Presence and typing](presence-and-typing.md) (#10),
[Synchronisation](synchronisation.md) (#11). Retention (#12) and local
moderation (#13) are not covered yet.

## Conventions

- Error responses are `application/problem+json` with a stable `code`
  (see [HTTP API conventions](../technical/api-conventions.md)), namespace
  `room.*`.
- Timestamps: UTC ISO-8601. Identifiers: ULID
  (see [user identifier](../technical/user-identifier.md) for the one
  exception, the account's own `name/server`).
- `Room.lastSeq` is a 64-bit integer, serialised as a decimal **string** (not a
  JSON number) to avoid precision loss past 2^53.

## The `Room` object

```json
{
  "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "type": "channel",
  "parentId": "01ARZ3NDEKTSV4RRFFQ69G5FAW",
  "visibility": "public",
  "slug": "general",
  "name": "general",
  "topic": null,
  "avatarBlobId": null,
  "defaultRole": "member",
  "readOnly": false,
  "originServer": "ekoz.example.com",
  "lastSeq": "42",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "updatedAt": "2026-01-01T00:00:00.000Z"
}
```

`type` is one of `space` | `channel` | `dm` | `group_dm`
(see [conversation data model](../technical/conversation-data-model.md));
`POST /spaces` and `POST /rooms` (below) create `space` / `channel`,
`POST /dms` and `POST /group-dms` (see [Direct and group
conversations](#direct-and-group-conversations)) create `dm` / `group_dm`.
`visibility` is `public` | `private` | `invite`.

## Hierarchy

### `POST /spaces`

Create a space (hierarchy node, holds no message).

- Body: `{ name, topic?, visibility?, parentId? }`. `visibility` defaults to
  `private`.
- Needs `space.create_child` on `parentId` when given. **Creating a root space
  (no `parentId`) is owner-only for now** — there is no parent node to check a
  capability against, and no server-wide `space.create_child` grant exists yet.
- The creator becomes a member of the new space with the `space_admin` role
  (`invitedById: null`), including a server owner creating a root space. Emits
  `room_created` then `member_joined`; the returned `Room.lastSeq` already
  accounts for both.
- `201`: `Room`.
- Errors: `room.permission_denied` (`403`), `room.parent_not_found` (`422`),
  `room.max_depth_exceeded` (`422`), validation (`422`).

### `POST /rooms`

Create a channel, attached to a space.

- Body: `{ parentId, name, topic?, slug?, visibility? }`. `parentId` is
  required and must reference a `space`.
- Needs `space.create_child` on `parentId`.
- The creator becomes a member of the new channel with the `room_admin` role
  (`invitedById: null`). Emits `room_created` then `member_joined`; the returned `Room.lastSeq` already
  accounts for both.
- `201`: `Room`.
- Errors: `room.permission_denied` (`403`), `room.parent_not_found` (`422`),
  `room.invalid_parent_type` (`422`, `parentId` is not a space),
  `room.max_depth_exceeded` (`422`), validation (`422`).

### `GET /rooms`

The caller's spaces and channels, as the tree the client shows. Needs only
authentication. `dm` / `group_dm` rooms and deleted rooms are left out.

- `200`: `{ items: RoomListItem[] }`, ordered by `createdAt` (then `id`). Not
  paginated: `rooms.max_depth` bounds the tree and a per-user listing is small;
  the `items` envelope leaves room for a later `nextCursor`.
- `RoomListItem` is every [`Room`](#the-room-object) field plus
  `role: RoomRole | null` and `access`:
  - `member`: the caller holds an explicit `Membership` on the room; `role` is
    its role. Only these rooms can be left (`POST /rooms/:id/leave`).
  - `inherited`: a descendant of a space the caller is a member of, with no
    membership of its own; `role` is the role of the nearest ancestor
    membership, the same rule as the effective role (see
    [Permissions](#permissions)).
  - `context`: an ancestor space the caller does not belong to, listed only to
    place a `member` or `inherited` room in the tree; `role` is `null`.
- `unreadCount: integer | null`: the number of `message_created` events sent by
  someone else since the caller's [read marker](messages-and-interactions.md#read-markers),
  or since the caller joined when there is no marker (a rejoin resets that
  baseline). Redacted messages are not counted. Capped at `100`, meaning "100 or
  more". `null` for `context` rooms.
- Known limitation: overrides are not evaluated. An `inherited` room with a
  `room.read` deny override is listed, while `GET /rooms/:id` answers `403`.

```json
{
  "items": [
    { "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV", "type": "space", "parentId": null, "...": "...", "role": null, "access": "context" },
    { "id": "01ARZ3NDEKTSV4RRFFQ69G5FAW", "type": "space", "parentId": "01ARZ3NDEKTSV4RRFFQ69G5FAV", "...": "...", "role": "member", "access": "member" },
    { "id": "01ARZ3NDEKTSV4RRFFQ69G5FAX", "type": "channel", "parentId": "01ARZ3NDEKTSV4RRFFQ69G5FAW", "...": "...", "role": "member", "access": "inherited" }
  ]
}
```

### `GET /rooms/:id`

Room detail. Needs `room.read`.

- `200`: `Room`.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`).

### `GET /rooms/:id/children`

Direct children of a room (not the whole subtree). Needs `room.read` on `:id`.

- `200`: `Room[]`, ordered by creation time.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`).

### `PATCH /rooms/:id`

Update name / topic / visibility / read-only. Needs `space.manage`.

- Body (all optional): `{ name, topic, visibility, readOnly }`.
- `200`: `Room`.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`),
  validation (`422`).

### `POST /rooms/:id/move`

Move a room under a new parent, or detach a space to the root
(`parentId: null`). Needs `space.manage` on `:id`. Rewrites the whole subtree's
ancestry in one transaction (see
[event log and ordering](../technical/event-log-and-ordering.md) for the
transactional-write pattern this follows).

- Body: `{ parentId }` (`parentId: null` only valid for a `space`; a `channel`
  must stay attached to a space).
- `200`: `Room`.
- Errors: `room.not_found` (`404`), `room.parent_not_found` (`422`),
  `room.permission_denied` (`403`), `room.cycle` (`422`, the new parent is `:id`
  itself or one of its own descendants), `room.max_depth_exceeded` (`422`),
  `room.invalid_parent_type` (`422`).

### `DELETE /rooms/:id`

Soft-delete a room. Needs `space.manage`. Blocked while the room still has live
children — delete or move them first.

- `204`.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`),
  `room.not_empty` (`409`).

## Permissions

Capability-based ACL: a closed, protocol-versioned set of capability strings
resolved against named roles, with overrides — see
[permission model](../technical/permission-model.md) for the full resolution
algorithm. The capability list (grows only additively):

```
room.read, room.post, room.edit_own, room.delete_own, room.edit_any,
room.delete_any, room.react, room.pin, room.invite, room.kick, room.ban,
room.manage_members, room.manage_roles, room.manage_permissions,
room.manage_retention, room.manage_groups, space.create_child, space.manage,
directory.publish
```

Roles: `space_admin`, `room_admin`, `moderator`, `member`, `reader` — plus the
server-level `owner`, an implicit allow-all outside this set.

`room.manage_groups` (create, rename, delete room groups and change their
members) is granted by default to `space_admin` and `room_admin`.

A caller's effective role on a room, in order: an explicit `Membership` on the
room; else the role inherited from the nearest ancestor space membership; else
`room.defaultRole` if the room is `public` or the caller holds a pending
invitation to it; else no access (the server owner always passes).

### `GET /rooms/:id/my-permissions`

The caller's effective capability set on `:id` — drives client UI gating.

- `200`: `{ capabilities: Capability[] }`.
- Errors: `room.not_found` (`404`).

### `PUT /rooms/:id/permissions`

Set a role-scoped override on `:id`, inherited by descendants. Needs
`room.manage_permissions` on `:id`. Emits `permission_override_changed`.

- Body: `{ role, capability, effect }` (`effect` is `allow` | `deny`).
- `204`.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`),
  validation (`422`).

### `PUT /rooms/:id/members/:userId/permissions`

Set a per-user override on `:id`, inherited by descendants. Beats a same-node
role override. Needs `room.manage_permissions` on `:id`. Emits
`permission_override_changed`.

- Body: `{ capability, effect }`.
- `204`.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`),
  validation (`422`).

## Membership

Join/leave, invitations, invite-only join requests, kick, ban/unban and role
change (technical.md §9, issue #4).

### The `Membership` object

```json
{
  "roomId": "01ARZ3NDEKTSV4RRFFQ69G5FAW",
  "userId": "01ARZ3NDEKTSV4RRFFQ69G5FAX",
  "role": "member",
  "joinedAt": "2026-01-01T00:00:00.000Z",
  "invitedById": null
}
```

### The `Invitation` object

```json
{
  "id": "01ARZ3NDEKTSV4RRFFQ69G5FAY",
  "roomId": "01ARZ3NDEKTSV4RRFFQ69G5FAW",
  "userId": "01ARZ3NDEKTSV4RRFFQ69G5FAX",
  "invitedById": "01ARZ3NDEKTSV4RRFFQ69G5FAZ",
  "role": "member",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "expiresAt": null,
  "acceptedAt": null,
  "declinedAt": null
}
```

### The `UserSummary` object

The minimum needed to show a user next to some content. `identifier` is the
canonical `name/server` (`null` without a username) and `avatarUrl` the
versioned avatar URL, both built like in `GET /me`. For a deleted account
`identifier`, `displayName` and `avatarUrl` are all `null`.

```json
{
  "id": "01ARZ3NDEKTSV4RRFFQ69G5FAZ",
  "identifier": "alice/ekoz.example.com",
  "displayName": "Alice",
  "avatarUrl": "https://api.ekoz.example.com/users/alice/avatar?v=01ARZ3NDEKTSV4RRFFQ69G5FB1"
}
```

### The `JoinRequest` object

```json
{
  "id": "01ARZ3NDEKTSV4RRFFQ69G5FB0",
  "roomId": "01ARZ3NDEKTSV4RRFFQ69G5FAW",
  "userId": "01ARZ3NDEKTSV4RRFFQ69G5FAX",
  "createdAt": "2026-01-01T00:00:00.000Z",
  "resolvedAt": null,
  "resolvedById": null,
  "approved": null
}
```

### `POST /rooms/:id/join`

Join a `public` room. Blocked by an existing `RoomBan`. Emits `member_joined`.

- `201`: `Membership`.
- Errors: `room.not_found` (`404`), `room.not_joinable` (`422`, not a `public`
  room), `room.banned` (`403`), `room.already_member` (`409`).

### `POST /rooms/:id/leave`

Leave a room. Emits `member_left` — **except** for a `dm`: there, leaving sets
`Membership.hiddenAt` instead of removing the row (the membership is fixed)
and emits nothing; the other participant is unaffected.

- `204`.
- Errors: `room.not_found` (`404`), `room.membership_not_found` (`404`).

### `POST /rooms/:id/invitations`

Invite a user to the room. Needs `room.invite`.

- Body: `{ userId, role? }`. `role` defaults to `member`.
- `201`: `Invitation`.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`),
  `room.invitation_already_exists` (`409`), validation (`422`).

### `GET /me/room-invitations`

The caller's pending room invitations, newest first. Pending means neither
accepted nor declined (`expiresAt` is not enforced). An invitation to a deleted
room is left out.

- `200`: `{ items: [{ id, role, createdAt, room, invitedBy }] }` where `room` is
  `{ id, type, name, topic, visibility }` and `invitedBy` a
  [`UserSummary`](#the-usersummary-object).

### `POST /invitations/:id/accept`

Accept a pending invitation (invitee only). Creates/updates the `Membership`
at the invitation's `role`. Emits `member_joined`.

- `201`: `Membership`.
- Errors: `room.invitation_not_found` (`404`), `room.banned` (`403`),
  `room.invitation_already_resolved` (`409`).

### `POST /invitations/:id/decline`

Decline a pending invitation (invitee only).

- `204`.
- Errors: `room.invitation_not_found` (`404`),
  `room.invitation_already_resolved` (`409`).

### `GET /rooms/:id/preview`

What a non-member of an invite-only room may see to ask to join it. Needs no
capability, only authentication.

- `200`: `{ id, type, name, topic, joinRequest }` where `joinRequest` is `null`
  or `{ id, createdAt, status }` — the caller's own request, `status` being
  `pending` (unresolved) or `rejected`. An approved request is not shown
  (`joinRequest` is `null`: the caller is a member by then).
- Only a room whose `visibility` is `invite` and that is not deleted answers;
  a `public`, `private`, deleted or unknown room is `404`, so a `private`
  room is never revealed. A member or a banned user of an `invite` room gets
  the same `200`.
- Errors: `room.not_found` (`404`).

### `POST /rooms/:id/join-request`

Request to join an invite-only room. Requesting again after a rejection resets
the same request to pending.

- `201`: `JoinRequest`.
- Errors: `room.not_found` (`404`), `room.banned` (`403`),
  `room.already_member` (`409`), `room.join_request_already_exists` (`409`).

### `GET /rooms/:id/join-requests`

The pending join requests of a room (neither approved nor rejected), for a
moderator to resolve. Needs `room.manage_members`.

- Query: `?cursor=&limit=`. `limit` defaults to, and is capped at,
  `rooms.directory_page_size`. `cursor` is an opaque token from a previous
  response's `nextCursor`; a malformed one reads as the first page.
- `200`: `{ items: PendingJoinRequest[], nextCursor: string | null }`, oldest
  first. `PendingJoinRequest` is `{ id, roomId, createdAt, user: UserSummary }`
  (see [The `UserSummary` object](#the-usersummary-object)); for a deleted
  account the nullable `UserSummary` fields are `null`. A request made again
  after a rejection is pending again and keeps its `createdAt`.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`),
  validation (`422`).

### `POST /rooms/:id/join-requests/:requestId/approve`

Approve a pending join request. Needs `room.manage_members`. Creates the
`Membership` at the room's `defaultRole`. Emits `member_joined`.

- `201`: `Membership`.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`),
  `room.join_request_not_found` (`404`),
  `room.join_request_already_resolved` (`409`).

### `POST /rooms/:id/join-requests/:requestId/reject`

Reject a pending join request. Needs `room.manage_members`.

- `204`.
- Errors: same as approve.

### `DELETE /rooms/:id/members/:userId`

Kick a member out. Needs `room.kick`. Emits `member_kicked`.

- `204`.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`),
  `room.membership_not_found` (`404`).

### `POST /rooms/:id/bans`

Ban a user, removing any existing membership. Needs `room.ban`. Emits
`member_banned`.

- Body: `{ userId, reason? }`.
- `204`.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`),
  validation (`422`).

### `DELETE /rooms/:id/bans/:userId`

Unban a user. Needs `room.ban`. Emits `member_unbanned`.

- `204`.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`).

### `PATCH /rooms/:id/members/:userId`

Change a member's role. Needs `room.manage_roles`. The target role cannot
exceed the caller's own effective authority (the server owner is exempt).
Emits `role_changed`.

- Body: `{ role }`.
- `200`: `Membership`.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`),
  `room.membership_not_found` (`404`), `room.role_above_authority` (`403`),
  validation (`422`).

### `GET /rooms/:id/members`

The **effective** members of a room: those with an explicit `Membership` on the
room plus those of its ancestor spaces, one entry per distinct user. Access is
inherited from ancestor spaces (see [Permissions](#permissions)), so explicit
memberships alone would miss a space member who never joined the channel. When a
user has several, the nearest one wins (the room itself, then its parent, ...),
resolved through the room hierarchy like the effective role. Needs `room.read`.

- Query: `?cursor=&limit=`. `limit` defaults to `100` and is capped at `200`.
  `cursor` is an opaque token from a previous response's `nextCursor`.
- `200`: `{ items: Member[], nextCursor: string | null }`, ordered by user `id`.
- `Member` is `{ role, joinedAt, user: UserSummary }` (see
  [The `UserSummary` object](#the-usersummary-object)); `role` and `joinedAt`
  come from the winning membership. For a deleted account the nullable
  `UserSummary` fields are `null`.
- Errors: `room.permission_denied` (`403`), `room.not_found` (`404`),
  validation (`422`).

## Room groups

A **group** is a named set of members defined on a room or a space, mentioned as
`@<name>` (see [Messages and interactions](messages-and-interactions.md#mentions)).
A group is visible from its own node and from every descendant of it.

```json
{
  "id": "01ARZ3NDEKTSV4RRFFQ69G5FAV",
  "nodeId": "01ARZ3NDEKTSV4RRFFQ69G5FAW",
  "name": "devs",
  "memberCount": 3,
  "inherited": false,
  "isMember": true
}
```

- `nodeId` is the room or space the group is defined on. `inherited` is `true`
  when it differs from the `:id` the group is read through. `isMember` is about
  the caller. A detail view adds `members: UserSummary[]`.
- `name` matches `^[a-z0-9_.-]{1,32}$`. `all` and the five role names are
  reserved (`422 group.name_reserved`).
- A name is unique over the whole chain of the node: its ancestors, itself and
  its descendants (`409 group.name_taken`). Siblings do not share a chain.
- A member must be an effective member of the group's node
  (`422 group.member_not_member`).
- When a user leaves, is kicked from or is banned from a node, they are removed
  from the groups defined on that node and its descendants.
- Moving a room is refused (`409 group.name_taken`) when it would put two
  same-named groups on one chain.
- Deleting a group does not change the audience of messages that already
  mentioned it.

### `GET /rooms/:id/groups`

Groups defined on `:id` and on its ancestors. Needs `room.read`.

- `200`: `{ items: Group[] }`, ordered by `name`.
- Errors: `room.permission_denied` (`403`), `room.not_found` (`404`).

### `GET /rooms/:id/groups/:groupId`

A group and its members. Needs `room.read`.

- `200`: `Group` with `members: UserSummary[]`.
- Errors: `room.permission_denied` (`403`), `room.not_found` (`404`),
  `group.not_found` (`404`, the group is not defined on `:id` or an ancestor).

### `POST /rooms/:id/groups`

Create a group on `:id`. Needs `room.manage_groups` on `:id`. Emits
`group_changed` (`created`).

- Body: `{ name, memberIds? }`.
- `201`: `Group` with `members`.
- Errors: `room.permission_denied` (`403`), `room.not_found` (`404`),
  `group.name_reserved` (`422`), `group.name_taken` (`409`),
  `group.member_not_member` (`422`), validation (`422`).

### `PATCH /rooms/:id/groups/:groupId`

Rename a group. Needs `room.manage_groups` on the **group's node**. Emits
`group_changed` (`renamed`). The tokens already frozen in messages keep the old
name.

- Body: `{ name }`.
- `200`: `Group` with `members`.
- Errors: as `POST`, plus `group.not_found` (`404`).

### `DELETE /rooms/:id/groups/:groupId`

Delete a group and its members. Needs `room.manage_groups` on the group's node.
Emits `group_changed` (`deleted`).

- `204`.
- Errors: `room.permission_denied` (`403`), `group.not_found` (`404`).

### `PUT /rooms/:id/groups/:groupId/members/:userId`

Add a member. Idempotent: adding a member already in the group changes nothing
and emits nothing. Needs `room.manage_groups` on the group's node. Emits
`group_changed` (`member_added`).

- `204`.
- Errors: `room.permission_denied` (`403`), `group.not_found` (`404`),
  `group.member_not_member` (`422`).

### `DELETE /rooms/:id/groups/:groupId/members/:userId`

Remove a member. Idempotent. Needs `room.manage_groups` on the group's node.
Emits `group_changed` (`member_removed`).

- `204`.
- Errors: `room.permission_denied` (`403`), `group.not_found` (`404`).

## Direct and group conversations

`dm` and `group_dm` rooms (technical.md §7, issue #5): outside the hierarchy
(`parentId` always `null`), never in `RoomClosure` beyond their self row, and
never in the [public directory](#directory) (that filters to `type =
"channel"`). Both use the same `Room` object as spaces/channels.

A `dm`'s two members are always `member`; a `group_dm`'s creator additionally
gets a per-user `room.manage_members` override (a "light `room_admin`" scoped
to member management only, not the full `room_admin` role — see
[permission model](../technical/permission-model.md)). All other capabilities
resolve through the normal `member` defaults.

### `POST /dms`

Get or create a direct conversation with a user. `dmKey = sorted(callerId,
userId)` dedupes: a second call from either side returns the same room.

- Body: `{ userId }`.
- `201`: `Room` (`type: "dm"`) — the existing room if one already exists for
  this pair.
- Errors: `room.dm_self` (`422`, `userId` is the caller), validation (`422`).

### `POST /group-dms`

Create a group conversation. No dedup — always creates a new room.

- Body: `{ userIds, name? }`. The caller is added automatically alongside
  `userIds`.
- `201`: `Room` (`type: "group_dm"`).
- Errors: validation (`422`).

## Directory

Public listing and search of `channel` rooms (technical.md §8, issue #6).
`dm` / `group_dm` and non-`public` channels never appear here.

### `GET /directory`

- Query: `?query=&cursor=`. `query` searches `name` + `topic`: PostgreSQL
  full-text search (`to_tsvector('simple', ...)`, GIN-indexed) for 3+
  characters, an `ILIKE` prefix match for shorter queries. `cursor` is an
  opaque token from a previous response's `nextCursor`.
- `200`: `{ items: Room[], nextCursor: string | null }`, page size
  `rooms.directory_page_size`, ordered by `name`.

### `POST /rooms/:id/publish`

Flip a room to `visibility: "public"`, listing it in the directory. Needs
`directory.publish`. Emits `room_updated { visibility }`.

- `200`: `Room`.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`).

### `POST /rooms/:id/unpublish`

Flip a room to `visibility: "private"`, delisting it. Needs
`directory.publish`. Emits `room_updated { visibility }`.

- `200`: `Room`.
- Errors: `room.not_found` (`404`), `room.permission_denied` (`403`).

## Room events

Every state change in this feature appends a `room_event`
(see [event log and ordering](../technical/event-log-and-ordering.md)): a
row keyed `(roomId, seq)`, `seq` monotonic per room. `RoomEventType` is a
closed, additively-grown enum; only the types below carry a payload this
increment actually writes. Every other declared type
(`message_hidden`, `retention_changed`) is reserved for the issue that
implements it (#12) — its payload shape is not fixed yet.
`message_*` / `reaction_*` / `pin_*` / `receipt_updated` payloads are on
[Messages and interactions](messages-and-interactions.md#room-events).

| type | payload |
|---|---|
| `room_created` | `{ type, parentId, visibility, name }` |
| `room_updated` | `{ name?, topic?, visibility?, readOnly?, defaultRole? }` — only the fields set on the current state at write time |
| `room_moved` | `{ oldParentId, newParentId }` |
| `room_deleted` | `{}` |
| `permission_override_changed` | `{ scope: "role", role, capability, effect }` or `{ scope: "user", userId, capability, effect }` |
| `member_joined` | `{ userId, role }` — also appended right after `room_created` for the creator |
| `member_left` | `{ userId }` |
| `member_kicked` | `{ userId }` |
| `member_banned` | `{ userId, reason }` |
| `member_unbanned` | `{ userId }` |
| `role_changed` | `{ userId, role }` |
| `group_changed` | `{ groupId, change, name, userId? }` — `change` is `created`, `renamed`, `deleted`, `member_added` or `member_removed`; `userId` is set for the two member changes. Appended on the group's own node, so it only reaches that node's effective members |

`senderId` on the event row already carries the actor (inviter, kicker,
banner, ...); `content` only ever carries the delta.
