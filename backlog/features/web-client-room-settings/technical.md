# Web client room settings — technical design

Technical design for room and space settings across `apps/server`, `packages/sdk` and
`apps/client-web`. Product decisions are in [overview.md](./overview.md); this page
grounds them in the code.

Related: [rooms and permissions protocol](../../../docs/protocol/rooms-and-permissions.md),
[permission model](../../../docs/technical/permission-model.md),
[retention and tombstones](../../../docs/technical/retention-and-tombstones.md),
[web client rooms](../../../docs/technical/web-client-rooms.md).

## 1. Findings from the current code

| # | Finding | Where | Consequence |
|---|---------|-------|-------------|
| F1 | **Retention already exists on the server**: `GET` / `PUT /rooms/:id/retention` (`rule` + resolved `effective`), the `retention_changed` event, the resolver (own, nearest ancestor, then `retention.default`) and the sweep worker (`hide` / `delete`, batched, idempotent). Only the protocol pages, the SDK and the client are missing. The overview assumed the server side was missing. | [retention.controller.ts](../../../apps/server/src/modules/conversations/retention/retention.controller.ts), [retention.service.ts](../../../apps/server/src/modules/conversations/retention/retention.service.ts), [retention-worker.service.ts](../../../apps/server/src/modules/conversations/retention/retention-worker.service.ts), [registry.ts:420](../../../apps/server/src/core/config/registry.ts) | No retention server work beyond one guard (S4); the protocol is documented and the SDK and client are built. |
| F2 | Rule shape is `inherit` / `keep` / `hide {after}` / `delete {after}`, `after` in seconds (`durationSeconds` accepts `0`). Nothing bounds it: `{ mode: 'delete', after: 0 }` is accepted and the next sweep redacts every message of the room and its descendants. | [retention-rule.ts](../../../apps/server/src/modules/conversations/retention/retention-rule.ts) | A minimum on the write path (S4). |
| F3 | Overrides can only be written: `PUT /rooms/:id/permissions` (upsert of `RoomPermissionOverride`) and `PUT /rooms/:id/members/:userId/permissions`. No read, and no way to remove an override once set. | [permissions.controller.ts](../../../apps/server/src/modules/conversations/permissions/permissions.controller.ts), [permissions.service.ts:77](../../../apps/server/src/modules/conversations/permissions/permissions.service.ts) | A read endpoint and a removal endpoint (S1), needed for the "inherited" cell. |
| F4 | Resolution: role default (`role_default_capability`), then role and per-user overrides along the ancestor chain, root to node, the nearest node winning. `permission_override_changed` carries `effect: allow \| deny`. | [permissions.service.ts:223](../../../apps/server/src/modules/conversations/permissions/permissions.service.ts), [room-event.types.ts:67](../../../apps/server/src/modules/conversations/events/room-event.types.ts) | The matrix is computed server-side with the same rule, so it cannot drift from the resolver. The event needs a value for "removed". |
| F5 | Nothing stops a role-wide `deny` on the capabilities that keep an admin in control (`room.read`, `room.manage_permissions`, `space.manage`) for `space_admin` / `room_admin`. Only the server owner could repair it. | [permissions.service.ts:77](../../../apps/server/src/modules/conversations/permissions/permissions.service.ts) | Server guard (S2). |
| F6 | `PATCH /rooms/:id` needs `space.manage` only, so it can flip `visibility` to or from `public` without `directory.publish`, which `POST publish` / `unpublish` require. Publishing is exactly `visibility = public`, unpublishing `visibility = private`; the directory lists `channel` rooms that are `public`. | [rooms.service.ts:194](../../../apps/server/src/modules/conversations/rooms/rooms.service.ts), [directory.service.ts:129](../../../apps/server/src/modules/conversations/directory/directory.service.ts) | Align the two (S3). The UI only drives `PATCH`. |
| F7 | `move` checks `space.manage` on the moved room but **nothing on the destination**. A room can be moved under a space its mover has no right on, and it then inherits that space's memberships and overrides. Creation requires `space.create_child` on the parent, and creating a root space is owner-only. | [rooms.service.ts:241](../../../apps/server/src/modules/conversations/rooms/rooms.service.ts), [rooms.service.ts:49](../../../apps/server/src/modules/conversations/rooms/rooms.service.ts) | Same rule on the destination (S3). |
| F8 | `DELETE /rooms/:id` refuses while live children exist (`room.not_empty`). `GET /rooms/:id/children` lists them (needs `room.read`). | [rooms.service.ts:339](../../../apps/server/src/modules/conversations/rooms/rooms.service.ts) | Deletion UI lists the children from that endpoint; no cascade. |
| F9 | Durable room events `room_updated`, `room_moved`, `room_deleted`, `retention_changed`, `permission_override_changed` exist, but the client interprets none of them: `features/rooms` has no live subscription, so a rename or a move made elsewhere never reaches the sidebar. `useRoomEvents` delivers every durable event for every visible room. | [room-event.types.ts](../../../apps/server/src/modules/conversations/events/room-event.types.ts), [use-realtime.ts](../../../apps/client-web/src/shared/realtime/use-realtime.ts) | New live-sync hook in `features/rooms` (C5). |
| F10 | `composerBlock` already disables the composer for a read-only room (unless `room.edit_any`), from the `room` the route passes down. The server also enforces it. | [composer-state.ts](../../../apps/client-web/src/features/chat/lib/composer-state.ts), [messages.service.ts:45](../../../apps/server/src/modules/conversations/messages/messages.service.ts) | Nothing to build for the composer; it only needs a fresh `room`, which C5 provides. |
| F11 | `/rooms/$roomId` renders `RoomGate` + `RoomHeader` and an `<Outlet />` for child pages (`requests`). `RoomHeader` receives `capabilities`. The sidebar has no per-room capability, so it cannot gate a settings entry by itself. Client features cannot import each other. | [$roomId.tsx](../../../apps/client-web/src/routes/_app/rooms/$roomId.tsx), [room-header.tsx](../../../apps/client-web/src/features/rooms/components/room-header.tsx), [room-tree.tsx](../../../apps/client-web/src/features/rooms/components/room-tree.tsx) | Settings is a child route under the same gate; the entry point is the room / space header. |
| F12 | The SDK has none of: update, move, delete, retention, permission matrix. | [rooms.ts](../../../packages/sdk/src/resources/rooms.ts) | New bindings (section 3). |

## 2. Server changes (`apps/server`, `conversations` module)

### S1. Permission matrix read and removal (`permissions/`)

- `GET /rooms/:id/permissions`, needs `room.manage_permissions`. Response
  `{ items: PermissionCell[] }`, one item per `role` x `capability` (5 x 18):

  ```
  { role, capability,
    default: 'allow' | 'deny',                 // role_default_capability
    own: 'allow' | 'deny' | null,              // override set on this node
    inherited: { effect, nodeId } | null,      // nearest ancestor override
    effective: 'allow' | 'deny' }              // what the resolver yields for that role
  ```

  Per-user overrides are not part of it. `PermissionsService.getMatrix` loads the
  defaults, the closure chain and the role overrides of the chain in three reads,
  and folds them with the same loop as `resolve` (extracted to a shared pure
  function, so there is a single implementation). The server owner is not a role and
  is not shown.
- `DELETE /rooms/:id/permissions/:role/:capability`, needs `room.manage_permissions`,
  `204`, idempotent. Deletes the node's `RoomPermissionOverride` row, appends
  `permission_override_changed` with `effect: 'inherit'` (new third value of the enum,
  for the `role` scope only) and calls `invalidateSubtree`.
- `PUT /rooms/:id/permissions` is unchanged apart from S2.

### S2. Lockout guard

`setRoleOverride` refuses `effect: 'deny'` when `role` is `space_admin` or
`room_admin` and `capability` is `room.read`, `room.manage_permissions` or
`space.manage`: `422 room.protected_permission` (new error). It covers role-wide
overrides only: a per-user override targets one person and another admin can undo it.
The server owner is exempt from resolution, so it is never locked out. The client
disables those cells (C3).

### S3. Visibility and move authority (`rooms/`)

- `updateRoom`: when `patch.visibility` changes whether the room is `public`
  (`(patch.visibility === 'public') !== (room.visibility === 'public')`), the actor also
  needs `directory.publish` (`403 room.permission_denied` otherwise). `private` <->
  `invite` needs `space.manage` only. `publish` / `unpublish` are unchanged and stay
  equivalent shortcuts.
- `moveRoom`: the actor also needs `space.create_child` on the destination, the same
  rule as creating a child there. Detaching a space to the root is owner-only, like
  creating a root space. Checked before any closure work.

### S4. Retention minimum

`PUT /rooms/:id/retention` rejects `hide` / `delete` with `after < 3600`
(`422` validation, refinement on `SetRoomRetentionSchema` only, so the config default
and stored rules keep their schema). The GET view and the worker are unchanged.

### S5. Protocol and docs

- New page `docs/protocol/retention.md`: rule shape, `GET` / `PUT`, resolution, worker
  behaviour, `retention_changed`, the 1 h minimum. Linked from
  [rooms-and-permissions.md](../../../docs/protocol/rooms-and-permissions.md) (whose
  intro still says retention is not covered) and the protocol README.
- [rooms-and-permissions.md](../../../docs/protocol/rooms-and-permissions.md): matrix
  `GET`, override `DELETE`, `effect: inherit`, the guard, the `PATCH` visibility rule,
  the move destination rule. Entries in [CHANGELOG.md](../../../docs/protocol/CHANGELOG.md).
- Hurl collection: `http/permissions/` gains matrix, remove and protected-deny files;
  `http/retention/` a below-minimum case.

## 3. SDK (`packages/sdk`)

Types regenerated through `openapi:emit` then `bun run generate`. A changeset (minor).

- `rooms`: `update(roomId, body)` (`PATCH`), `move(roomId, parentId | null)`,
  `delete(roomId)`, `getRetention(roomId)`, `setRetention(roomId, rule)`,
  `getPermissions(roomId)`, `setRolePermission(roomId, { role, capability, effect })`,
  `clearRolePermission(roomId, role, capability)`.
- `publish` / `unpublish` are not bound: `update` with `visibility` covers them.
- Wire types: `RoomRetentionView`, `RetentionRule`, `PermissionCell`,
  `PermissionMatrix`, `UpdateRoomBody`.

## 4. Web client (`apps/client-web`)

### C1. Ownership and route

Everything lives in `features/rooms` (`components/settings/`), so no cross-feature
import. Route `/_app/rooms/$roomId/settings` (`routes/_app/rooms/$roomId/settings.tsx`),
a child page under the existing `RoomGate` and `RoomHeader`, like `requests`. The
tab is a search param `?tab=general|permissions|retention`, validated in the route
(unknown value falls back to the first visible tab), so a tab is linkable and survives
a reload. The route hands `room` and `capabilities` from the gate to
`RoomSettings`. `web-client-mentions` adds its `groups` tab by extending the tab list
and its own fallback route `/rooms/$roomId/groups` is then dropped.

**Entry point.** `RoomHeader` shows a Settings button when the caller holds any of
`space.manage`, `room.manage_permissions`, `room.manage_retention`. There is no
sidebar menu (adjusting the overview): the sidebar has no per-room capabilities (F11),
and a space row already opens the space page, whose header carries the button.

**Tabs and gates.**

| Tab | Shown with | Content |
|-----|------------|---------|
| General | `space.manage` | C2 |
| Permissions | `room.manage_permissions` | C3 |
| Retention | `room.manage_retention` | C4 |

A direct load of a tab the caller cannot see redirects to the first visible tab; with
none, to the room. `dm` / `group_dm` never show the button.

### C2. General tab

Zod + react-hook-form, like `create-room-form.tsx`.

- **Details form**: name (1..200), topic (max 2000), read-only switch. Sends only the
  changed fields to `rooms.update`.
- **Visibility**: `private` / `invite` / `public`. For a channel, `public` is labelled
  "Public, listed in the directory"; for a space `public` has no directory line.
  The `public` choice is disabled without `directory.publish`, and so is leaving
  `public` (S3), with an explanation. Switching away from `public` asks for
  confirmation ("the room leaves the directory").
- **Move**: a select of destination spaces built from the cached `useRooms()` list:
  spaces only, minus the room and its own descendants (computed with the existing tree
  helper). A root option is offered for a space, to the server owner only
  (`useMe().isOwner`). The server stays the authority: `room.cycle`,
  `room.max_depth_exceeded`, `room.invalid_parent_type`, `room.parent_not_found` and
  `room.permission_denied` (no `space.create_child` on the target) map to messages under
  `rooms.settings.move.*`. A note states that access follows the new parent.
- **Danger zone**: Delete room, a dialog asking to type the room name. On
  `room.not_empty`, the dialog switches to a list of the children
  (`useRoomChildren(roomId)`, `GET /rooms/:id/children`, each linking to its page) with
  the instruction to move or delete them first; no cascade. On success it navigates to
  the parent space, or `/rooms` for a root space.

### C3. Permissions tab

`usePermissionMatrix(roomId)` on `rooms.getPermissions`. A table with the 18
capabilities as rows, grouped (reading and posting, moderation, management, space) and
the 5 roles as columns, ordered by rank. Each cell is a three-state control:

- **Inherit** (no own override): shows the resolved value (`effective`) and, when
  `inherited` is set, "from <parent name>" (name from the rooms list, otherwise
  "a parent space"); otherwise "default".
- **Allow** / **Deny**: `setRolePermission`; back to inherit is
  `clearRolePermission`.

Cells whose deny is refused by S2 (`space_admin` / `room_admin` x `room.read`,
`room.manage_permissions`, `space.manage`) have deny disabled with a tooltip; the
server error `room.protected_permission` maps to the same message. Each change is a
mutation with the row pending state; the matrix is invalidated on settle (a `422` or
`403` means it was stale). Per-user overrides are not shown.

### C4. Retention tab

`useRoomRetention(roomId)` on `rooms.getRetention`.

- Mode select: **Inherit** (shows `effective` in words, for instance "Inherited:
  delete after 30 days"), **Keep everything**, **Hide after**, **Delete after**.
- Duration: a number and a unit (hours, days), minimum 1 hour (S4), stored as seconds.
- A note under Delete: messages are erased for good and leave a tombstone
  ([retention and tombstones](../../../docs/technical/retention-and-tombstones.md)); under
  Hide: the content stays in the database, hidden from the UI.
- Save calls `setRetention`. The server applies it on its next sweep (15 min default),
  which the tab states.

### C5. Live sync and cache

- New hook `useRoomEventsSync` in `features/rooms/hooks/`, mounted once by
  `SidebarRooms`, on `useRoomEvents`:

  | Event | Invalidates |
  |-------|-------------|
  | `room_updated` | `roomKeys.list()`, `detail(roomId)`, `preview(roomId)` |
  | `room_moved` | `list()`, `detail(roomId)`, the `permissions` of the room and of every listed descendant |
  | `room_deleted` | `list()`, `detail(roomId)` (the gate then shows "unavailable") |
  | `retention_changed` | `roomKeys.retention(roomId)` |
  | `permission_override_changed` | `roomKeys.permissionMatrix(roomId)` and every `['rooms','permissions']` (a change on a space reaches its descendants) |

  This also fixes the sidebar not following renames and moves (F9), and gives the
  composer a fresh `readOnly` (F10).
- Keys added to `roomKeys`: `retention(roomId)`, `permissionMatrix(roomId)`,
  `children(roomId)`. Mutations invalidate the same keys on settle, so the acting tab
  does not depend on its own echo.
- Strings under `rooms.settings.*` in the French and English catalogues.

## 5. Alternatives considered

| Topic | Retained | Rejected | Why |
|-------|----------|----------|-----|
| Matrix source | Server-computed cells (`default`, `own`, `inherited`, `effective`) | Client folds raw overrides and defaults | One resolution implementation; the client would need the defaults table and the ancestor overrides anyway. |
| Removing an override | `DELETE` endpoint, event `effect: inherit` | `PUT` with a null effect; a new event type | Symmetric with the resource; the existing event shape only gains one value. |
| Lockout | Server guard on role-wide deny of three capabilities | Client warning only | The protocol is the only place that holds for every client. |
| Visibility vs publish | `PATCH` requires `directory.publish` on a public transition; the UI drives `PATCH` | UI drives `publish` / `unpublish` for public transitions | One call for the whole form, one rule server-side, no authority bypass. |
| Move authority | `space.create_child` on the destination | `space.manage` on the moved room only | A move grants the room the destination's access rules; it must need the same right as creating there. |
| Retention minimum | 1 h on the write path | None; or a config key | `after: 0` wipes a room on the next sweep; a config key is more than needed for a fixed safety floor. |
| Settings placement | Child route with `?tab=` under the room gate | Dialog; a route per tab | Mirrors `requests`, linkable, and the mentions groups tab slots in without new routing. |
| Sidebar entry | None; header button | Space menu in the sidebar | No per-room capabilities in the list (F11). |
| Delete with children | Block and list them | Client-side cascade | A cascade is many irreversible calls with partial failure. |

## 6. Consequences

- **Protocol changes**: new `GET /rooms/:id/permissions` and `DELETE
  /rooms/:id/permissions/:role/:capability`; `permission_override_changed` gains
  `effect: inherit`; `PUT` role override can answer `422 room.protected_permission`;
  `PATCH` visibility and `move` require more capabilities than before; `PUT
  /rooms/:id/retention` refuses `after < 3600`. All additive or restrictive, no SDK
  method existed for them. Existing e2e specs that move a room or flip visibility with a
  bare `space.manage` holder (conversations-rooms, conversations-directory,
  conversations-permissions) are adjusted; new specs cover each guard.
- The role defaults give `directory.publish` to `space_admin` and `room_admin`, so
  default roles keep working; a custom deny of `directory.publish` now also blocks
  visibility changes to and from `public`.
- The stored retention rules and `retention.default` keep their schema; a rule below 1 h
  already stored keeps applying.
- `web-client-mentions` (Groups tab) and `web-client-room-moderation` (its
  `useRoomsRealtime` account-event hook, a different subscription from C5) are
  independent of this feature; neither must ship first.
- A design page under `docs/technical/` records the matrix rule, the guard, the move
  authority and the retention floor when the feature ships.

## Implementation tasks

In delivery order.

- [#198](https://github.com/marmotz/ekoz/issues/198): Server: permission matrix read, override removal and lockout guard (S1, S2)
- [#199](https://github.com/marmotz/ekoz/issues/199): Server: directory.publish on visibility changes, move destination authority, retention minimum (S3, S4)
- [#200](https://github.com/marmotz/ekoz/issues/200): Docs: retention protocol page and room settings protocol changes (S5)
- [#201](https://github.com/marmotz/ekoz/issues/201): SDK: room settings bindings (3)
- [#202](https://github.com/marmotz/ekoz/issues/202): Client: settings route, header entry point and live room sync (C1, C5)
- [#203](https://github.com/marmotz/ekoz/issues/203): Client: General tab, details, visibility, move, delete (C2)
- [#204](https://github.com/marmotz/ekoz/issues/204): Client: Permissions tab, role x capability matrix (C3)
- [#205](https://github.com/marmotz/ekoz/issues/205): Client: Retention tab (C4)
- [#206](https://github.com/marmotz/ekoz/issues/206): Docs: `docs/technical/web-client-room-settings.md`
