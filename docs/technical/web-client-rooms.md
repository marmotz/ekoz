# Web client rooms

## Context

`apps/client-web` could sign in and, with [web client chat](web-client-chat.md),
render a room's conversation, but had no way to find, create or enter a room. The
`web-client-rooms` scope adds the rooms UI: a tree of the caller's spaces and channels
in the sidebar, a gate deciding what the caller may see of a room, room creation, the
public directory, pending invitations and join request moderation.

Checking the product scoping against the code showed gaps on the server and in the SDK:

- `GET /invitations` was already the owner-only list of **registration**
  invitations; room invitations could only be accepted or declined, not listed;
- creating a room wrote no `Membership`, so a creator was not a member of their own
  room;
- access to a channel also comes from its ancestor spaces, so "the rooms I am a
  member of" is not the tree the user expects;
- a non-member of an `invite` room gets `403` on `GET /rooms/:id`, with nothing to
  build a "request to join" screen from, and no endpoint returned the caller's own
  join request;
- invitations and join requests only carried user ULIDs, and no endpoint resolves a
  ULID to a name.

The feature-level design is in
[`backlog/features/web-client-rooms/technical.md`](../../backlog/features/web-client-rooms/technical.md);
this page records what shipped and why. It builds on
[web client bootstrap](web-client-bootstrap.md) (boundaries, session, SDK client), the
[permission model](permission-model.md) and the
[rooms and permissions protocol](../protocol/rooms-and-permissions.md).

## Decision

### Server and protocol

Every endpoint is described in
[rooms-and-permissions.md](../protocol/rooms-and-permissions.md) and listed in
[`docs/protocol/CHANGELOG.md`](../protocol/CHANGELOG.md); the SDK types are generated
from `apps/server/openapi.json`.

- **Creator membership.** Creating a space or a channel inserts, in the same
  transaction, a `Membership` for the creator (`space_admin` for a space,
  `room_admin` for a channel) and appends `member_joined` right after
  `room_created`. A data migration
  (`20260921T1913_conv_creator_membership_backfill`) backfills it for existing rooms.
  The creator can therefore `leave`, like any member.
- **`GET /rooms`**: the caller's spaces and channels as `{ items: RoomListItem[] }`,
  ordered by `createdAt`, unpaginated. Each item is a `Room` plus `role` and
  `access`: `member` (explicit membership), `inherited` (descendant of a space the
  caller belongs to; `role` from the nearest ancestor membership, the same rule as the
  permission resolver) or `context` (an ancestor space listed only to place a room in
  the tree, `role: null`). One SQL query over `membership` and `room_closure`, not a
  resolver call per room; an e2e spec asserts that the listed `role` equals the
  resolver's effective role.
- **`GET /me/room-invitations`**: the caller's pending invitations, newest first, as
  `{ items }`, each with the room summary (`id`, `type`, `name`, `topic`,
  `visibility`) and the inviter as a `UserSummary`. Accept and decline keep their
  endpoints (`POST /invitations/:id/accept|decline`), both answering
  `409 room.invitation_already_resolved` once resolved elsewhere.
- **`UserSummary`** (`id`, `identifier`, `displayName`, `avatarUrl`) is the one shape
  used wherever the client shows "who": the three last fields are `null` for a
  deleted account, and the client renders a localized "Deleted account".
- **`GET /rooms/:id/preview`**: name, topic and the caller's join request state
  (`pending` / `rejected`, or `null`) of an `invite` room. Any other room answers
  `404 room.not_found`, so a `private` room is never revealed.
- **`GET /rooms/:id/join-requests`**: the pending requests of a room, oldest first,
  paged with `cursor` / `nextCursor` (a moderation queue can grow), guarded on
  `room.manage_members`.

### SDK

`createClient` gains `rooms` (`list`, `get`, `preview`, `children`, `myPermissions`,
`createSpace`, `createChannel`, `join`, `leave`, `requestToJoin`, `listJoinRequests`,
`approveJoinRequest`, `rejectJoinRequest`), `roomInvitations` (`listMine`, `accept`,
`decline`; distinct from the registration `invitations`) and `directory` (`list`). No
new error class: `EkozError.code` carries the `room.*` codes.

### Client layout and boundaries

```
src/features/rooms/
  api/          query keys, query option factories, room error table
  hooks/        query and mutation hooks, useRoomAccess
  components/   SidebarRooms, RoomTree, RoomGate, RoomHeader, CreateRoomForm,
                DirectoryList, InvitationList, JoinRequestList
  routes/       RoomsWelcomePage
  lib/          route paths shared by the sidebar and the welcome page
src/shared/layout/sidebar-section-registry.ts
src/shared/sdk/use-me.ts
src/routes/_app/rooms.tsx            layout, registers the sidebar section
src/routes/_app/rooms/               index, new, directory, invitations,
                                     $roomId, $roomId/requests
```

The rooms feature imports only `shared` and itself. The route files stay thin; only
`$roomId.tsx` composes two features (see [`RoomGate`](#roomgate)). Strings live under
`rooms.*` in `common.json` (French and English), since key typing derives from
`common` only.

### Sidebar section slot

`registerNav()` only renders links, and the tree needs a component. `shared/layout`
gained `registerSidebarSection({ id, order, component })`, with the same
de-duplication by id as `registerNav()`; the shell renders every section under the
navigation, in both the fixed sidebar and the mobile sheet, and passes an
`onNavigate` callback that closes the sheet. The `/rooms` layout route registers
`SidebarRooms` at import time, as `index.tsx` registers "Home". `SidebarRooms` renders
nothing unless the session is `authenticated`.

The tree comes from `buildRoomTree(items)`, a pure function: grouped by `parentId`,
roots are the items whose parent is not listed, server order kept. `context` items are
non-link headers, `member` and `inherited` items link to `/rooms/$roomId`. Collapsed
spaces persist under `ekoz.rooms.collapsed` in `localStorage` (guarded like the theme
and language keys). The section header holds New, Directory and Invitations, the last
with a badge counting the pending invitations.

### `RoomGate`

`useRoomAccess(roomId)` resolves one state, fetching each step only when the previous
one did not decide: the cached rooms list and invitations first, then `GET /rooms/:id`,
then, on `403`, `GET /rooms/:id/preview`.

| State         | Condition                                                   | UI                                                        |
|---------------|-------------------------------------------------------------|-----------------------------------------------------------|
| `member`      | listed with `access` `member` or `inherited`                | children                                                  |
| `invited`     | `GET /rooms/:id` ok and a pending invitation for the room   | Accept / Decline banner above the children                |
| `joinable`    | `GET /rooms/:id` ok and `visibility: public`                | Join banner above the children                            |
| `request`     | `GET /rooms/:id` -> `403`, preview ok                       | name, topic, Request to join / pending / declined         |
| `unavailable` | `404` on the room or on the preview                         | neutral "does not exist or is not accessible"             |

Plus `loading` (skeleton) and `error` (retry). `children` is a **render function**
receiving `{ room, capabilities, membership }`: `room` is the list item or
`GET /rooms/:id`, `capabilities` comes from `GET /rooms/:id/my-permissions`, and
`membership` is one of the three readable states. It is called in those three states
only. This is the single place where room access is fetched: `/rooms/$roomId` renders
`RoomHeader` and `RoomChat` (web-client-chat) from these values, and the chat never
asks for the room or the permissions again. A child page (`/rooms/$roomId/requests`)
replaces the chat under the same gate and header.

`RoomHeader` shows name, topic and type, the channels of a space, Leave only for an
explicit membership (`access: "member"`; leaving an inherited room would answer
`404 room.membership_not_found`), and the "Requests" link only with
`room.manage_members`.

### Pages

- `/rooms`: welcome page, pointing to the directory and creation when the caller has
  no room, to the invitations when some are pending.
- `/rooms/new`: `CreateRoomForm`. Eligible parents are the listed spaces where
  `myPermissions` includes `space.create_child` (one cached query per space); a server
  owner (`useMe().isOwner`) may also create a root space. A channel needs a parent.
  Parent error codes map to the parent field, `422` issues to their fields; success
  opens the new room.
- `/rooms/directory`: public channels, search debounced 300 ms, paged on
  `nextCursor`; "Open" for a room the caller already reads, otherwise "Join"
  (`room.already_member` opens it anyway).
- `/rooms/invitations`: `InvitationList`, one row per invitation with room name and
  type, inviter, role and date. Accept opens the room, Decline drops the row.
- `/rooms/$roomId/requests`: `JoinRequestList`, approve or reject each pending
  request, paged.

Sending invitations is out of scope (invitee side only); invite flows are exercised
through the server Hurl collection.

### Data, freshness and invalidation keys

| Key                              | Source                          |
|----------------------------------|---------------------------------|
| `['rooms','list']`               | `GET /rooms`                    |
| `['rooms','invitations']`        | `GET /me/room-invitations`      |
| `['rooms','detail',id]`          | `GET /rooms/:id`                |
| `['rooms','preview',id]`         | `GET /rooms/:id/preview`        |
| `['rooms','permissions',id]`     | `GET /rooms/:id/my-permissions` |
| `['rooms','directory',query]`    | `GET /directory`, infinite      |
| `['rooms','join-requests',id]`   | `GET /rooms/:id/join-requests`, infinite |

The list and the invitations override the global query defaults with
`staleTime: 10_000` and `refetchOnWindowFocus: true`; everything else keeps the global
`false`. Every mutation invalidates what it changes:

- create a space or a channel -> `list`;
- join, leave -> `list`, `permissions` of the room (join also on
  `room.already_member`, which means the list was stale);
- request to join -> `preview` of the room;
- accept -> `list`, `invitations`, `permissions`; decline -> the same plus `detail`
  (a pending invitation was what let the caller read an invite-only room). Both run
  on failure too, so an invitation answered elsewhere leaves the list;
- approve -> `join-requests` of the room and `list`; reject -> `join-requests`. Both
  run on failure too, for the same reason.

These keys are the contract with `shared/realtime`: the SSE-driven invalidation of
this feature (`room_updated`, `role_changed`, `permission_override_changed` and the
caller's `member_*` events -> `list`, `detail`, `permissions` of the room;
reconnection -> `list` and `invitations`; invitation and join request frames on the
account feed -> `invitations` and `list`, once the protocol emits them) subscribes
from inside the feature and touches no other feature's keys.
The chat feature never touches them.

## Alternatives

| Topic                           | Chosen                                                      | Rejected                                                    | Why                                                                                                   |
|---------------------------------|-------------------------------------------------------------|-------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| Room invitations listing        | `GET /me/room-invitations`                                  | `GET /invitations`; `GET /room-invitations`                 | `GET /invitations` is taken by registration invitations; `/me/` states whose list it is.              |
| Creator access                  | Explicit creator membership, with a backfill                | `GET /rooms` returning every room to the owner              | Also covers non-owner creators; "member of" keeps one meaning.                                        |
| `GET /rooms` content            | `member` + `inherited` + `context` ancestors, with `access` | Explicit memberships only                                   | A space member would not see its channels, and a lone channel would have no parent in the tree.       |
| Role in the list                | SQL over the closure table, guarded by an equivalence spec  | The permission resolver per room                            | One query instead of N resolver runs; the drift risk is covered by the spec.                          |
| Non-member of an `invite` room  | `GET /rooms/:id/preview` with the caller's request          | A generic screen; a pending state inferred from `409`       | Shows name, topic and request state without revealing `private` rooms.                                |
| Who invites / requests          | Embedded `UserSummary`                                      | `GET /users/by-id/:id`                                      | No new public lookup surface, no N+1.                                                                 |
| Freshness                       | Focus and mutation refetch; the keys as the SSE contract    | Polling                                                     | Nothing throwaway once the live invalidation lands.                                                   |
| Sidebar tree placement          | `registerSidebarSection` slot                               | A secondary route pane; the shell importing the feature     | Keeps the shell feature-agnostic and the tree visible on every page.                                  |
| Room access for the chat        | `RoomGate` render function `{ room, capabilities, membership }` | Each feature fetching the room and its permissions      | One owner, one cache, no duplicate requests; the route composes both features.                        |
| Creation UI                     | `/rooms/new` route                                          | Dialog                                                      | Linkable and testable, no dialog state.                                                               |
| Feature strings                 | `rooms.*` in `common.json`                                  | A `rooms` i18n namespace                                    | Key typing derives from `common` only, and `shared` cannot import a feature.                          |

## Consequences

- Creating a room now writes a membership and a `member_joined` event; the backfill
  migration must run before the client is used against existing data.
- `GET /rooms` and `GET /me/room-invitations` are unpaginated; their `{ items }`
  envelope makes a later `nextCursor` additive if a server hosts users in thousands of
  rooms.
- `GET /rooms/:id/preview` reveals the name and topic of an `invite` room to any
  authenticated user who knows its ULID; acceptable since ULIDs are unguessable and
  such a room is meant to be reached by a shared link.
- `context` rows expose an ancestor space's name to a member of one of its channels;
  `Room.parentId` already pointed at it.
- An `inherited` room with a `room.read` deny override is listed but answers `403`:
  `GET /rooms` does not evaluate overrides.
- Until the live invalidation lands, the rooms list and the invitations update on
  focus, on mutation and on open only; so does `RoomGate` when access is gained or
  lost while a room is open. The unseen dot in the tree, read from
  `shared/realtime/unseen-rooms.ts`, is the other follow-up of this feature.
