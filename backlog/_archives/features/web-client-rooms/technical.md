# Web client rooms — technical design

Technical design for the rooms UI of `apps/client-web`, the server listings it
needs in `apps/server`, and the matching SDK bindings in `packages/sdk`. Product
decisions are in [overview.md](./overview.md); this page grounds them in the code.
What shipped is recorded in [web client rooms](../../../../docs/technical/web-client-rooms.md).

Related: [rooms and permissions protocol](../../../../docs/protocol/rooms-and-permissions.md),
[conversations technical design](../conversations/technical.md),
[permission model](../../../../docs/technical/permission-model.md),
[web client bootstrap](../../../../docs/technical/web-client-bootstrap.md),
[OpenAPI description and SDK types](../../../../docs/technical/openapi-description-and-sdk-types.md).

## 1. Findings from the current code

| # | Finding | Where | Consequence |
|---|---------|-------|-------------|
| F1 | `GET /invitations` is already the owner-only list of **registration** invitations. Room invitations only have `POST /invitations/:id/accept\|decline`. The SDK's `client.invitations` is the registration one. | [invitations.controller.ts](../../../../apps/server/src/modules/identity/invitations/invitations.controller.ts), [identity.md](../../../../docs/protocol/identity.md), [invitations.ts](../../../../packages/sdk/src/resources/invitations.ts) | The overview's `GET /invitations` is renamed `GET /me/room-invitations`; SDK namespace `client.roomInvitations`. |
| F2 | `createNode` creates the room, closure rows and `room_created`, but **no `Membership`**. A server owner creating a root space is not a member of it. | [rooms.service.ts:286](../../../../apps/server/src/modules/conversations/rooms/rooms.service.ts) | A membership-based `GET /rooms` would not show a room to its own creator. |
| F3 | Effective role resolves from an explicit membership, else the nearest ancestor **space** membership, else `defaultRole` for a `public` room or a pending invitation. | [permissions.service.ts:172](../../../../apps/server/src/modules/conversations/permissions/permissions.service.ts) | A space member reads its channels with no row of their own; the list must return inherited rooms, and the client must know which rooms it can actually `leave` (explicit membership only, otherwise `404 room.membership_not_found`). |
| F4 | `GET /rooms/:id` needs `room.read`; a non-member of an `invite` room gets `403 room.permission_denied`. A pending invitation grants read access before acceptance. | [rooms.service.ts:76](../../../../apps/server/src/modules/conversations/rooms/rooms.service.ts), F3 | The "request to join" screen needs a dedicated preview. A user with a pending invitation can read the room without being a member. |
| F5 | `RoomInvitation.invitedById` and `RoomJoinRequest.userId` are ULIDs. `GET /users/:identifier` takes `name/server`, not a ULID. | [profile.controller.ts:108](../../../../apps/server/src/modules/identity/profile/profile.controller.ts) | The new listings embed a user summary. |
| F6 | `createJoinRequest` on a room with a resolved request resets it to pending (upsert). No endpoint reads the caller's own request. | [membership.service.ts:210](../../../../apps/server/src/modules/conversations/membership/membership.service.ts) | The preview carries the caller's request state. |
| F7 | `RoomInvitation.expiresAt` is never written by the server (always `null`) and never checked. | [membership.service.ts](../../../../apps/server/src/modules/conversations/membership/membership.service.ts) | "Pending" means `acceptedAt` and `declinedAt` both null, same as the resolver's `pendingInvitation`. |
| F8 | The client query defaults are `staleTime: 30s` and `refetchOnWindowFocus: false`. The nav registry is a flat list of links. i18n keys are typed from `common.json` only. | [query-client.ts:22](../../../../apps/client-web/src/app/query-client.ts), [nav-registry.ts](../../../../apps/client-web/src/shared/layout/nav-registry.ts), [use-translation.ts](../../../../apps/client-web/src/shared/i18n/use-translation.ts) | Per-query freshness overrides, a sidebar section slot, feature strings under `rooms.*` in `common.json`. |
| F9 | The SDK type pipeline is `openapi:emit` (server DTOs) -> `bun run generate` (tako) -> `packages/sdk/src/generated/api` -> `wire.ts` re-exports. `RoomViewDto`, `MembershipViewDto`, `JoinRequestViewDto`, `RoomInvitationViewDto`, `DirectoryListResponseDto` and `MyPermissionsResponseDto` are already generated; no `rooms` resource exists. | [wire.ts](../../../../packages/sdk/src/types/wire.ts) | Only the new views need generating; the resources are new hand-written bindings. |

## 2. Server changes (`apps/server`, `conversations` module)

All in `src/modules/conversations`, following the existing controller / service /
`*.view.ts` split (Zod schemas + `createZodDto`, `@ApiProblemResponses`). Cross-module
reads (users, profiles) go through `PrismaService`, never by importing the `identity`
module (the `lint:boundaries` rule).

### S1. Creator membership

In `createNode`, inside the creation transaction, insert a `Membership` for the actor
(`space_admin` for a `space`, `room_admin` for a `channel`) and append `member_joined`
after `room_created`. Adds a data migration backfilling one membership per existing
`space` / `channel` from `Room.createdById` where none exists.

Consequence to note in the protocol page: the creator holds an explicit membership
and can `leave` (a creator who leaves loses access, as any member). This is also a
prerequisite of [`web-client-chat`](../web-client-chat/technical.md): the creator
must appear in the room members list and receive the room's live events.

### S2. `GET /rooms`

The caller's spaces and channels, as `{ items: RoomListItem[] }` ordered by `createdAt`.
Every listing of this feature uses the `items` envelope of the directory and admin user
listings, so that adding `nextCursor` later is not a breaking change. No pagination in
this increment for this one: `rooms.max_depth` bounds the tree and a per-user listing is
small.

Item: every `Room` field plus `role: RoomRole | null` and
`access: "member" | "inherited" | "context"`:

- `member`: explicit `Membership` (`role` = its role).
- `inherited`: descendant of a space the caller is a member of, no own membership
  (`role` = role of the nearest ancestor membership, smallest `RoomClosure.depth`,
  the same rule as [`resolveRole`](../../../../apps/server/src/modules/conversations/permissions/permissions.service.ts)).
- `context`: an ancestor space needed to place a `member` / `inherited` room in the
  tree, that the caller does not belong to (`role: null`). Exposes its `name` and
  `topic` only as far as `Room` does; the client renders it as a non-link group header.

Only `type IN ('space','channel')` and `deleted_at IS NULL` (dm / group_dm are out of
scope). One raw SQL query in the style of
[`DirectoryService.list`](../../../../apps/server/src/modules/conversations/directory/directory.service.ts)
over `membership` and `room_closure`; no per-room resolver call.

Known limitation: a `room.read` deny override on an inherited room is not reflected
(the resolver would refuse it); such a room is listed and `GET /rooms/:id` answers
`403`. Acceptable for the first increment, documented in the protocol page.

Live delivery: the account feed currently fans out to explicit memberships only, so
an `inherited` room receives no live events until `web-client-chat` S5 (fan-out to
effective members, decided there) lands. Until then such rooms update on focus
and on open only. S5 is therefore a prerequisite of the live behaviour of this feature.

### S3. `GET /me/room-invitations`

New controller `@Controller('me/room-invitations')` in `membership/`. Pending
invitations for the caller (F7), newest first, room not deleted, as `{ items: [...] }`
(no cursor in this increment, same reasoning as `GET /rooms`), each item being:

```
{ id, role, createdAt,
  room: { id, type, name, topic, visibility },
  invitedBy: UserSummary }
```

`UserSummary = { id, identifier: string | null, displayName: string | null, avatarUrl: string | null }`,
the one shape used everywhere the client shows "who" (also by `GET /rooms/:id/members`
in [`web-client-chat`](../web-client-chat/technical.md) S2, which embeds it as
`Member.user`). `identifier` is `${user.name}/${server.domain}` (as `GET /me`), or
`null` when the account has no username; `avatarUrl` is `null` without avatar, otherwise
the versioned URL `<api_url>/users/<name>/avatar?v=<avatarBlobId>`. Both are built with the
`core/http/user-links.ts` helpers introduced by
[#103](https://github.com/marmotz/ekoz/issues/103) of `identity-and-profiles` (see its
[technical design](../identity-and-profiles/technical.md) S4), since `conversations` cannot import
`identity`; all
three nullable fields are `null` for a deleted account (the client renders its localized
"Deleted account", per the forward contract in
[conversations §20](../conversations/technical.md)). Accept and decline keep their
current endpoints and payloads.

### S4. `GET /rooms/:id/preview`

Authenticated, no capability. `200` only when the room exists, is not deleted and is
`invite`; otherwise `404 room.not_found` (a `private` room must not be revealed):

```
{ id, type, name, topic,
  joinRequest: { id, createdAt, status: "pending" | "rejected" } | null }
```

`status` from `RoomJoinRequest.approved` (`null` -> pending, `false` -> rejected;
`true` -> `joinRequest: null`, since a later kick leaves a stale `approved`, and
a fresh `POST /rooms/:id/join-request` resets it anyway, F6).

### S5. `GET /rooms/:id/join-requests`

Needs `room.manage_members` (`403 room.permission_denied`, `404 room.not_found`).
Pending requests (`approved IS NULL`), oldest first, paginated like the directory
listing (`cursor`, `limit`; a moderation queue can grow):
`{ items: { id, roomId, createdAt, user: UserSummary }[], nextCursor: string | null }`.
Approve / reject keep their endpoints.

### Cross-cutting server work

- Protocol: [rooms-and-permissions.md](../../../../docs/protocol/rooms-and-permissions.md)
  gains `GET /rooms`, `GET /me/room-invitations`, `GET /rooms/:id/preview`,
  `GET /rooms/:id/join-requests`, the `RoomListItem` / `UserSummary` shapes, and the
  creator-membership rule; `docs/protocol/CHANGELOG.md` updated.
- `bun run openapi:emit` regenerates `apps/server/openapi.json` (CI runs `openapi:check`).
- Hurl files under `apps/server/http/`: `rooms/list.hurl`, `rooms/preview.hurl`,
  `rooms/preview-not-found.hurl`, `membership/list-my-invitations.hurl`,
  `membership/list-join-requests.hurl`, `membership/list-join-requests-forbidden.hurl`;
  `http/README.md` layout block kept in sync.
- `apps/server/CHANGELOG.md` entries under `## [Unreleased]`.
- Check [SDK packaging and protocol policy](../../../../docs/technical/sdk-packaging-and-protocol-policy.md)
  for the version note in `docs/protocol/CHANGELOG.md` (S1 changes a behaviour, the
  listings are additive). `rooms-and-permissions.md` is also edited by
  `web-client-chat` (members endpoint); Prisma migrations of both features are
  ordered, the creator-membership backfill first.
- Tests: e2e specs (`conversations-rooms`, `conversations-membership`) for each
  endpoint; a spec asserting that the `role` returned by `GET /rooms` equals
  `effectiveRole` for `member` and `inherited` items (guards SQL / resolver drift);
  updated creation e2e specs for S1; a unit test for the preview status mapping.

## 3. SDK bindings (`packages/sdk`)

New resources, wired in [client.ts](../../../../packages/sdk/src/client.ts) beside
`invitations` and following the `SessionManager.request` pattern of
[users.ts](../../../../packages/sdk/src/resources/users.ts):

| Namespace | Methods |
|-----------|---------|
| `client.rooms` | `list()`, `get(id)`, `preview(id)`, `children(id)`, `myPermissions(id)`, `createSpace(body)`, `createChannel(body)`, `join(id)`, `leave(id)`, `requestToJoin(id)`, `listJoinRequests(id, { cursor?, limit? })`, `approveJoinRequest(id, requestId)`, `rejectJoinRequest(id, requestId)` (`web-client-chat` later adds `members(id, { cursor?, limit? })` to the same resource) |
| `client.roomInvitations` | `listMine()`, `accept(id)`, `decline(id)` |
| `client.directory` | `list({ query?, cursor? })` |

Wire types: after `openapi:emit` + `bun run generate`, `wire.ts` re-exports the new
flat variants with the usual renames (`RoomListItem`, `RoomPreview`,
`MyRoomInvitation`, `PendingJoinRequest`, `UserSummary`, plus the already generated
`Room`, `Membership`, `JoinRequest`, `DirectoryListResponse`, `MyPermissionsResponse`).
Errors need nothing new: `EkozError.code` already carries `room.*` codes. Each method
gets a unit test in the style of `users.test.ts`; a changeset (`minor`) is added.

## 4. Web client (`apps/client-web`)

### 4.1 Layout

```
src/features/rooms/
  api/          # query keys + query/mutation option factories over the SDK
  hooks/        # useRooms, useRoomTree, useRoomAccess, useMyPermissions, useDirectory,
                # useInvitations, useJoinRequests, mutation hooks
  components/   # RoomTree, SidebarRooms, RoomGate, CreateRoomForm, DirectoryList,
                # InvitationList, JoinRequestList, RoomHeader
  routes/       # page components (the file routes stay thin)
src/routes/rooms/  # createFileRoute wrappers: index, directory, new, invitations,
                   # $roomId (+ $roomId/requests)
src/shared/sdk/use-me.ts   # `useMe()`: `client.me.get()`, key `['me']`; needed for `isOwner`,
                           # reused by `web-client-chat` (caller id), so this feature owns and creates it
```

`routes -> features` is allowed by the boundary matrix; the rooms feature imports only
`shared` and itself. i18n strings go under `rooms.*` in `common.json` (fr + en).

### 4.2 Sidebar section slot

`registerNav` only renders links. Add to `shared/layout` a `registerSidebarSection({ id,
order, component })` registry (same de-duplication as `registerNav`), rendered by a new
`SidebarSections` under `SidebarNav` in both the fixed `Sidebar` and the mobile `Sheet`
in [app-shell.tsx](../../../../apps/client-web/src/shared/layout/app-shell.tsx). The
route file `src/routes/rooms.tsx` registers `SidebarRooms` at import time, exactly as
`index.tsx` registers `home`. `SidebarRooms` renders nothing unless the session is
`authenticated`.

### 4.3 Routes

| Path | Content |
|------|---------|
| `/rooms` | Welcome / empty state; when the user has rooms, a hint to pick one (redirecting to the last visited room is a possible follow-up, not part of this design nor of `web-client-chat`). |
| `/rooms/new` | `CreateRoomForm`. |
| `/rooms/directory` | Directory search and join. |
| `/rooms/invitations` | Pending invitations, accept / decline. |
| `/rooms/$roomId` | `RoomGate` + `RoomHeader`. |
| `/rooms/$roomId/requests` | Join request moderation, visible only with `room.manage_members`. |

All wrapped in `RequireAuth`. `src/routes/rooms/$roomId.tsx` is created here and is the
only file for that path (no flat `rooms.$roomId.tsx`). Until `web-client-chat` lands it
renders `RoomGate` with a placeholder as children; `web-client-chat` then replaces the
placeholder with `RoomChat` (a route may import both features; the features never import
each other): rooms owns "can this user see the room", chat owns what is inside.

### 4.4 Sidebar tree

`buildRoomTree(items)` is a pure function: group by `parentId`, roots are items whose
parent is absent from the list, children keep server order. `access: "context"` nodes
render as non-link headers, `member` / `inherited` as links to `/rooms/$roomId`. Spaces
are collapsible; the collapsed set persists in `localStorage` under
`ekoz.rooms.collapsed` (try / catch, as the theme and language keys). `member` /
`inherited` links show an unseen dot from `useRoomHasUnseen(room.id)`, the
`shared/realtime/unseen-rooms.ts` store delivered by `web-client-chat` (until then
the store does not exist and no dot is rendered; wiring it is a small follow-up in this
feature). A header link to
`/rooms/invitations` shows a badge with the pending count; the header also holds the
"New" (`/rooms/new`) and "Directory" entries.

### 4.5 Data and freshness

Query keys: `['rooms','list']`, `['rooms','detail',id]`, `['rooms','preview',id]`,
`['rooms','permissions',id]`, `['rooms','directory',query]`, `['rooms','invitations']`,
`['rooms','join-requests',id]`.

Per the overview, no live channel yet: `['rooms','list']` and `['rooms','invitations']`
override the global defaults with `staleTime: 10_000` and `refetchOnWindowFocus: true`
(the global `false` stays for everything else). Every mutation invalidates what it
changes: create, join, leave, accept, decline -> `list` (+ `invitations`, `permissions`
of the room where relevant); approve / reject -> `join-requests` of that room.

Once `web-client-chat` delivers `shared/realtime` (generic `useAccountEvents` /
`useRoomEvents` / `useReconnected` hooks, no event interpretation), this feature
subscribes itself, in a component mounted with the sidebar section, and invalidates
its own keys: `invitation_created` and `join_request_resolved` (account frames) ->
`invitations` and `list`; `room_updated`, `role_changed`, `permission_override_changed`
and the caller's membership changes -> `list`, `detail` and `permissions` of the room;
reconnection -> `list` and `invitations`. This is a follow-up task of this feature,
blocked by the chat delivery; the chat feature never touches these keys. It is also
what lets `RoomGate` react to an access gained or lost while a room is open.

### 4.6 `RoomGate`

Given a `roomId`, resolves one state, from the cached list first. Its `children` is a
render function receiving `{ room, capabilities, membership }`: `room` is the list item
(`member`) or `GET /rooms/:id`, `capabilities` comes from `useMyPermissions`
(`['rooms','permissions',id]`), and `membership` is the state name below. This is the
single place where room access is fetched, so `web-client-chat` does not fetch it again.
`children` is rendered only when the room content is readable, i.e. in the first three
states.

| State | Condition | UI |
|-------|-----------|----|
| `member` | in the list with `access` `member` or `inherited` | children rendered; `RoomHeader` offers Leave only for `access: "member"` |
| `invited` | pending invitation for this room in `['rooms','invitations']` | banner with Accept / Decline; children rendered read-only (F4; the chat composer is disabled for non-members) |
| `joinable` | `GET /rooms/:id` ok, `visibility: public`, not in the list | Join button (`room.already_member` refreshes the list, `room.banned` shows an error); children rendered read-only |
| `request` | `GET /rooms/:id` -> `403`, then `GET /rooms/:id/preview` ok | name and topic, "Request to join", or "Request pending" / "Request declined" from `joinRequest`; no children |
| `unavailable` | `404`, or preview `404` | neutral "not found or not accessible"; no children |

`RoomHeader` shows the "Requests" link only when `myPermissions(id)` includes
`room.manage_members`.

### 4.7 Creation form

One form at `/rooms/new`: type (space / channel), parent, name, topic, visibility
(`private` default, as the server). Slug is not exposed (server-optional).

- Eligible parents: the `space` items of `GET /rooms` for which `myPermissions(id)`
  includes `space.create_child` (one cached `useQueries` per space; the list is small).
  `useMe().isOwner` adds the "no parent (root space)" option, for a space only.
- A channel requires a parent; a space's parent is optional.
- No eligible parent and not owner: an explanatory message instead of the form.
- Server errors are mapped from `EkozError.code` to localized messages:
  `room.permission_denied`, `room.parent_not_found`, `room.max_depth_exceeded`,
  `room.invalid_parent_type`; `422` field issues attach to their fields.
- Success: invalidate `list`, navigate to `/rooms/$roomId` of the new room.

### 4.8 Directory, invitations, requests

- Directory: search input debounced (300 ms), `useInfiniteQuery` on `nextCursor`,
  "Open" for rooms already in the list, otherwise "Join".
- Invitations: list with room name, inviter (`displayName` and `identifier`, or the
  localized deleted-account label), role; Accept navigates to the room, Decline removes
  the row.
- Join requests: list with requester and date; Approve / Reject; `409` on a request
  resolved elsewhere refreshes the list.
- Sending invitations is not part of this feature (invitee side only); invite flows are
  exercised through the Hurl collection.

### 4.9 Tests and definition of done

Vitest + Testing Library with the `@ekozhq/sdk` module mocked (bootstrap convention):
`buildRoomTree` (context / inherited / collapse), `SidebarRooms` (badge, empty state),
`RoomGate` (each state, the `403` -> preview fallback, and which states render children with `{ room, capabilities, membership }`), `CreateRoomForm` (eligibility,
owner root option, error mapping), directory paging and join, invitations, join
requests. `bun run typecheck`, `lint`, `lint:boundaries` green. `apps/client-web/CHANGELOG.md`
entries. A `docs/technical/` page ([web-client-rooms.md](../../../../docs/technical/web-client-rooms.md)) records the sidebar slot, the `RoomGate` states and the
endpoint decisions (this design, once shipped).

## 5. Alternatives considered

| Point | Retained | Rejected | Why |
|-------|----------|----------|-----|
| Room invitations listing path | `GET /me/room-invitations` | `GET /invitations` (taken, F1); `GET /room-invitations` | No ambiguity with registration invitations; user choice. |
| Creator access | Explicit creator membership (S1) | `GET /rooms` returns everything to the owner | Also fixes non-owner creators; consistent "member of" semantics; user choice. |
| `GET /rooms` content | member + inherited + context ancestors, with `access` | explicit memberships only | A space member would not see its channels; a lone channel would have no parent; user choice. |
| Role source in the list | SQL over closure, guarded by an equivalence test | calling the resolver per room | One query instead of N resolver runs; the drift risk is covered by the e2e spec. |
| Non-member of an invite room | `GET /rooms/:id/preview` | generic screen, 409-based pending state | Name, topic and request state; user choice. |
| Who invites / requests | Embedded `UserSummary` | `GET /users/by-id/:id` | No new public lookup surface, no N+1; user choice. |
| Freshness | Focus + mutation refetch, keys as the SSE contract | Polling | No throwaway polling once `web-client-chat` lands; user choice. |
| Sidebar tree | New `registerSidebarSection` slot | Tree inside a secondary route pane; shell importing the feature | Keeps the shell feature-agnostic and the tree visible on every page. |
| Creation UI | Route `/rooms/new` | Dialog | No new shared `Dialog`, linkable and testable. |
| Feature strings | `rooms.*` in `common.json` | A `rooms` i18n namespace | Typing derives from `common` only and `shared` cannot import a feature (F8). |

## 6. Consequences

- Server behaviour change (S1): creating a room now writes a membership and an event;
  existing e2e specs that count `member_joined` events or memberships need updating, and
  the backfill migration must run before the client is used against existing data.
- `GET /rooms` and `GET /me/room-invitations` are unpaginated: revisit if a server hosts
  users in thousands of rooms. Their `{ items }` envelope means adding `nextCursor` then
  is additive.
- `GET /rooms/:id/preview` reveals name and topic of an `invite` room to any
  authenticated user who knows its ULID; acceptable since ids are unguessable and the
  room is meant to be reached by a shared link.
- Four new server endpoints and three SDK namespaces widen the protocol surface;
  protocol docs, OpenAPI and the SDK ship together with the client feature.
- The `access: "context"` rows leak an ancestor space's name to a member of one of its
  channels; the same information is already visible through `Room.parentId`.
- Inherited rooms with a `room.read` deny override appear in the list but answer `403`
  (S2 limitation).
- The sidebar slot and the `RoomGate` composition are the seams `web-client-chat`
  builds on. Two small follow-ups land in this feature after the chat delivery: the
  unseen dot in `RoomTree` (4.4) and the SSE-driven invalidation of its own keys (4.5);
  otherwise no rework is expected.

## Implementation task breakdown

GitHub issues in `marmotz/ekoz`, label `feature:web-client-rooms`. Roughly in dependency order.

Server (`apps/server`):

1. [#62 — creator becomes a member on room creation](https://github.com/marmotz/ekoz/issues/62) (S1)
2. [#79 — `GET /rooms`](https://github.com/marmotz/ekoz/issues/79) (S2), depends on #62
3. [#63 — `UserSummary` and `GET /me/room-invitations`](https://github.com/marmotz/ekoz/issues/63) (S3), depends on #103 (`identity-and-profiles`)
4. [#64 — `GET /rooms/:id/preview`](https://github.com/marmotz/ekoz/issues/64) (S4)
5. [#80 — `GET /rooms/:id/join-requests`](https://github.com/marmotz/ekoz/issues/80) (S5), depends on #63

SDK (`packages/sdk`):

6. [#81 — rooms, room invitations and directory bindings](https://github.com/marmotz/ekoz/issues/81), depends on #79, #63, #64, #80

Web client (`apps/client-web`):

7. [#65 — sidebar section slot and `useMe`](https://github.com/marmotz/ekoz/issues/65) (4.2)
8. [#82 — data layer: queries, mutations, error mapping](https://github.com/marmotz/ekoz/issues/82) (4.1, 4.5), depends on #81
9. [#83 — sidebar tree and `/rooms` route shell](https://github.com/marmotz/ekoz/issues/83) (4.3, 4.4), depends on #65, #82
10. [#84 — invitations page](https://github.com/marmotz/ekoz/issues/84) (4.8), depends on #83, #82
11. [#85 — `RoomGate`, `RoomHeader` and `/rooms/$roomId`](https://github.com/marmotz/ekoz/issues/85) (4.6), depends on #83, #82, #64
12. [#86 — create a space or a channel](https://github.com/marmotz/ekoz/issues/86) (4.7), depends on #83, #82
13. [#87 — public directory](https://github.com/marmotz/ekoz/issues/87) (4.8), depends on #83, #82
14. [#88 — join request moderation screen](https://github.com/marmotz/ekoz/issues/88) (4.8), depends on #85, #80

Docs:

15. [#89 — document the design in `docs/technical/`](https://github.com/marmotz/ekoz/issues/89), depends on #84 to #88

Not created yet, blocked by the `web-client-chat` delivery (`shared/realtime` and
`shared/realtime/unseen-rooms.ts`, no issue exists for them yet): the unseen dot in the
sidebar tree (4.4) and the SSE-driven invalidation of this feature's query keys (4.5).
