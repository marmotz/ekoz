# Spaces, rooms, roles and permissions

Room hierarchy, capability ACL and their event-log surface. This is the wire
contract for `apps/server`'s `conversations` feature (issues #1-#3); a mismatch
between this page and `apps/server` is a bug, fixed here first (see
[HTTP API conventions](../technical/api-conventions.md)).

Messages, reactions, receipts, membership, presence/typing and synchronisation
are not covered yet — they land with their own issues (#4-#13) and their own
section of this page or a sibling page.

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
(see [conversation data model](../technical/conversation-data-model.md)); this
increment's endpoints only ever create `space` and `channel`. `visibility` is
`public` | `private` | `invite`.

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

> **Note.** `Membership` does not exist yet (issue #4): a caller's effective
> role on a room is currently `room.defaultRole` on a `public` room, or no
> access at all on a `private` / `invite` room (the server owner always
> passes). This narrows automatically to real membership-based resolution once
> #4 ships, with no change to these endpoints' shapes.

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

## Room events

Every state change in this feature appends a `room_event`
(see [event log and ordering](../technical/event-log-and-ordering.md)): a
row keyed `(roomId, seq)`, `seq` monotonic per room. `RoomEventType` is a
closed, additively-grown enum; only the types below carry a payload this
increment actually writes. Every other declared type
(`message_*`, `reaction_*`, `member_*`, `role_changed`, `pin_*`,
`retention_changed`, `receipt_updated`) is reserved for the issue that
implements it (#4, #7-#13) — its payload shape is not fixed yet.

| type | payload |
|---|---|
| `room_created` | `{ type, parentId, visibility, name }` |
| `room_updated` | `{ name?, topic?, visibility?, readOnly?, defaultRole? }` — only the fields set on the current state at write time |
| `room_moved` | `{ oldParentId, newParentId }` |
| `room_deleted` | `{}` |
| `permission_override_changed` | `{ scope: "role", role, capability, effect }` or `{ scope: "user", userId, capability, effect }` |
