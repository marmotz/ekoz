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
- `201`: `Room`.
- Errors: `room.permission_denied` (`403`), `room.parent_not_found` (`422`),
  `room.max_depth_exceeded` (`422`), validation (`422`).

### `POST /rooms`

Create a channel, attached to a space.

- Body: `{ parentId, name, topic?, slug?, visibility? }`. `parentId` is
  required and must reference a `space`.
- Needs `space.create_child` on `parentId`.
- `201`: `Room`.
- Errors: `room.permission_denied` (`403`), `room.parent_not_found` (`422`),
  `room.invalid_parent_type` (`422`, `parentId` is not a space),
  `room.max_depth_exceeded` (`422`), validation (`422`).

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
room.manage_retention, space.create_child, space.manage, directory.publish
```

Roles: `space_admin`, `room_admin`, `moderator`, `member`, `reader` — plus the
server-level `owner`, an implicit allow-all outside this set.

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

### `POST /rooms/:id/join-request`

Request to join an invite-only room.

- `201`: `JoinRequest`.
- Errors: `room.not_found` (`404`), `room.banned` (`403`),
  `room.already_member` (`409`), `room.join_request_already_exists` (`409`).

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
| `member_joined` | `{ userId, role }` |
| `member_left` | `{ userId }` |
| `member_kicked` | `{ userId }` |
| `member_banned` | `{ userId, reason }` |
| `member_unbanned` | `{ userId }` |
| `role_changed` | `{ userId, role }` |

`senderId` on the event row already carries the actor (inviter, kicker,
banner, ...); `content` only ever carries the delta.
