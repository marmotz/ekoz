# Web client direct messages — technical design

Technical design for one-to-one (`dm`) and group (`group_dm`) conversations in
`apps/client-web`, the server changes they need in `apps/server`, and the
matching SDK bindings in `packages/sdk`. Product decisions are in
[overview.md](./overview.md); this page grounds them in the code.

Related: [rooms and permissions protocol](../../../docs/protocol/rooms-and-permissions.md),
[permission model](../../../docs/technical/permission-model.md),
[web client rooms](../../../docs/technical/web-client-rooms.md),
[web client chat](../../../docs/technical/web-client-chat.md),
[OpenAPI description and SDK types](../../../docs/technical/openapi-description-and-sdk-types.md).

## 1. Findings from the current code

| # | Finding | Where | Consequence |
|---|---------|-------|-------------|
| F1 | `GET /rooms` filters to `type IN ('space', 'channel')`; nothing lists the caller's `dm` / `group_dm`. | [rooms.service.ts:98](../../../apps/server/src/modules/conversations/rooms/rooms.service.ts) | A new listing (S2). |
| F2 | The `group_dm` creator gets a per-user `room.manage_members` allow override. That capability only gates join-request listing / approve / reject. Removing a member needs `room.kick`, adding needs `room.invite`, renaming needs `space.manage` (`PATCH /rooms/:id`), none of which a `member` holds. | [dm.service.ts:121](../../../apps/server/src/modules/conversations/dm/dm.service.ts), [membership.service.ts:426](../../../apps/server/src/modules/conversations/membership/membership.service.ts), [membership.service.ts:547](../../../apps/server/src/modules/conversations/membership/membership.service.ts), [rooms.service.ts:195](../../../apps/server/src/modules/conversations/rooms/rooms.service.ts) | The "light admin" cannot manage anything today; group management needs its own endpoints (S4). |
| F3 | `leave` deletes a `group_dm` membership but not the user's `RoomMemberPermission` rows. | [membership.service.ts:207](../../../apps/server/src/modules/conversations/membership/membership.service.ts) | An admin who leaves and is re-added would still be admin. Fixed in S4. |
| F4 | `leave` on a `dm` only sets `Membership.hiddenAt`; nothing ever clears it, and no read path looks at it. | [membership.service.ts:214](../../../apps/server/src/modules/conversations/membership/membership.service.ts), [contract.prisma:517](../../../apps/server/src/core/prisma/contract.prisma) | "Delete the conversation" and reappearance need S1 and S2. |
| F5 | `POST /dms` and `POST /group-dms` never check that the target users exist or are active. | [dm.service.ts:30](../../../apps/server/src/modules/conversations/dm/dm.service.ts) | A conversation can be opened with a deleted or unknown id. Validated in S3. |
| F6 | `GET /users/:identifier` returns `{ identifier, displayName, bio, avatarUrl }`, no `id`, while `POST /dms` takes a `userId`. | [profile.dto.ts:32](../../../apps/server/src/modules/identity/profile/profile.dto.ts) | An exact-identifier lookup cannot start a conversation. `id` is added (S3). |
| F7 | No user search exists; the only lookup is by exact identifier. | [profile.controller.ts:108](../../../apps/server/src/modules/identity/profile/profile.controller.ts) | A new search (S3). |
| F8 | Message reads (`listMessages`, `getMessage`, `listPins`) and `GET /sync` only check `room.read`: any member reads the full history. | [messages.service.ts:215](../../../apps/server/src/modules/conversations/messages/messages.service.ts), [sync.service.ts:29](../../../apps/server/src/modules/conversations/streaming/sync.service.ts) | Per-member history limits need a floor enforced on each read path (S1). |
| F9 | Feed fan-out goes to every membership of the room, at append time. Events that reference an older message (`message_edited`, `reaction_added`, `pin_added`, ...) carry only `messageId`, never a body. | [feed-fanout.service.ts:28](../../../apps/server/src/modules/conversations/streaming/feed-fanout.service.ts), [room-event.types.ts:93](../../../apps/server/src/modules/conversations/events/room-event.types.ts) | A member with a history floor may receive such an event about a hidden message, but cannot read its content: `getMessage` answers `404`. No fan-out change needed. |
| F10 | `permission_override_changed` requires an `effect` (`allow` / `deny`); there is no "removed" shape. `member` does not hold `room.manage_members` by default. | [room-event.types.ts:66](../../../apps/server/src/modules/conversations/events/room-event.types.ts), [role-default-capabilities.ts](../../../apps/server/src/modules/conversations/permissions/role-default-capabilities.ts) | Revoking an admin writes `deny`, which is equivalent to the default and needs no new event shape. |
| F11 | In the client, `useRoomAccess` resolves a room from `GET /rooms` (no `dm`), then `GET /rooms/:id`, readable only for `public` rooms or a pending invitation. A `dm` link ends as `unavailable`. | [use-room-access.ts](../../../apps/client-web/src/features/rooms/hooks/use-room-access.ts) | Conversations get their own route and gate (4.3, 4.4). |
| F12 | `RoomChat` takes `{ room, capabilities, membership }` and is independent of the room type. `RoomHeader` already has `dm` / `groupDm` type labels. The shell exposes `registerSidebarSection`; realtime marks unseen rooms for any `roomId`. | [$roomId.tsx](../../../apps/client-web/src/routes/_app/rooms/$roomId.tsx), [room-header.tsx](../../../apps/client-web/src/features/rooms/components/room-header.tsx), [sidebar-section-registry.ts](../../../apps/client-web/src/shared/layout/sidebar-section-registry.ts), [realtime-provider.tsx](../../../apps/client-web/src/shared/realtime/realtime-provider.tsx) | The message view is reused as is; a new sidebar section and header. |
| F13 | `AccountService.findByIdentifier` also accepts an email address, so `GET /users/:identifier` resolves emails. | [account.service.ts:217](../../../apps/server/src/modules/identity/accounts/account.service.ts) | The client never sends an email-shaped input to the lookup (4.6). The server behaviour itself is out of scope here. |

## 2. Server changes (`apps/server`, `conversations` module)

Same conventions as the rooms work: controller / service / `*.view.ts` split,
Zod DTOs via `createZodDto`, `@ApiProblemResponses`, cross-module reads (users,
profiles) through `PrismaService` and `UserSummaryReader`, never by importing
`identity` (`lint:boundaries`). The one change inside `identity` (S3, profile
`id`) stays inside that module.

### S1. Per-member history floor

New nullable column `Membership.historyFromSeq BigInt?` (`history_from_seq`),
Prisma 8 migration, no backfill (`null` = full history, today's behaviour).

A member reads only messages with `seq >= historyFromSeq`. A new injectable
`HistoryFloorService` (`membership/history-floor.service.ts`) exposes
`floorFor(roomId, userId): Promise<bigint | null>` (explicit membership only;
inherited access from a space has no floor). It is enforced in:

- `MessagesService.listMessages`: `and(roomId, seq >= floor, seq < before)`.
  The response `lastSeq` is unchanged.
- `MessagesService.getMessage`, `editMessage`, `deleteMessage`, `pin`, `unpin`
  and `ReactionsService` put / delete: a message below the floor answers
  `404 message.not_found`, like an unknown message.
- `MessagesService.listPins`: pins of messages below the floor are left out.
- `SyncService.sync`: `since` is raised to `floor - 1` when lower, so a
  catch-up never returns older events.

The floor is set to `room.lastSeq + 1`, read in the same transaction:

- when a `dm` member "deletes the conversation" (`POST /rooms/:id/leave` on a
  `dm`, which already sets `hiddenAt`, see F4);
- when a member is added to a group with `history: "none"` (S4).

A concurrent message committed while the floor is being written may land on
either side of it. That is acceptable.

Reappearance of a deleted `dm`: `MessagesService.sendMessage`, in its
transaction, clears `hiddenAt` on every membership of the room when the room
is a `dm`. The floor stays, so the conversation comes back with only the
messages written after the deletion. `POST /dms` also clears the caller's own
`hiddenAt` when it returns an existing room (the caller reopens the
conversation from the picker), again keeping the floor.

### S2. `GET /me/conversations`

The caller's `dm` and `group_dm`, one raw SQL query like `GET /rooms`
([rooms.service.ts:94](../../../apps/server/src/modules/conversations/rooms/rooms.service.ts)).
It sits under `/me/` next to `GET /me/room-invitations`.

A conversation is listed for the caller when:

- the caller has a membership with `hiddenAt IS NULL`, and the room is not
  deleted;
- and the room has at least one message, or the caller created it
  (`createdById`). This is the "visible to others at the first message" rule.

Ordering is by last activity:
`coalesce(max(message.created_at) over messages with seq >= caller floor, room.created_at) DESC, id`,
using the existing `message (room_id, created_at)` index.

- `200`: `{ items: ConversationListItem[] }`, not paginated (same reasoning as
  `GET /rooms`; the `{ items }` envelope leaves room for a cursor).
- `ConversationListItem`: every `Room` field, plus:
  - `lastActivityAt` (ISO);
  - `participants: { user: UserSummary, isAdmin: boolean }[]`: every member
    except the caller (bounded by the group size limit, S4). `isAdmin` is
    `true` when the member has an `allow` `room.manage_members` user override
    on the room. It is always `false` in a `dm`;
  - `isAdmin: boolean` for the caller.

The client builds the display name from this: the other person for a `dm`,
otherwise `name`, else the truncated participant list.

### S3. Finding people

- `GET /me/contacts?query=`: active users who share at least one explicit
  membership with the caller in a non-deleted room (any type), excluding the
  caller. `query` is 2 to 100 characters, trimmed. It matches
  `user.name ILIKE query%` or `user_profile.display_name ILIKE %query%`, with
  `%` / `_` escaped. The result is capped at 20, ordered by `display_name`, and
  unpaginated.
  `200`: `{ items: UserSummary[] }`.
- `GET /users/:identifier` (identity) adds `id` to `PublicProfileView`. The
  change is additive; the SDK `PublicProfileView` type regenerates.
- `POST /dms` and `POST /group-dms` check that every target user exists with
  `status = active`, otherwise `422 room.user_not_found`. `POST /dms` keeps
  `room.dm_self`.

### S4. Group management

**Admin model.** A group admin is a member with a user override
`room.manage_members = allow` on the room: the existing "light `room_admin`"
of the permission model, now made effective. Clients read it from
`GET /rooms/:id/my-permissions` (own capability) and from S2 (`isAdmin`).
Every endpoint below requires `room.manage_members`, answers
`404 room.not_found` when the room is not a `group_dm` (no type leak), and
writes its events and overrides in one transaction, followed by
`permissions.invalidateRoom`.

Writing an override without `room.manage_permissions`: `PermissionsService`
gains an internal `writeMemberOverride(tx, actorId, nodeId, userId,
capability, effect)`, the body of today's `setMemberOverride` without the
capability check. `setMemberOverride` then calls it.

| Endpoint | Body | Effect | Events |
|----------|------|--------|--------|
| `PATCH /group-dms/:id` | `{ name: string (1-200) \| null }` | Rename or clear the name. | `room_updated { name }` |
| `POST /group-dms/:id/members` | `{ userIds: ULID[] (1-49), history: "full" \| "none" = "full" }` | Direct add as `member`, `invitedById` = actor. Users already members are ignored. `history: "none"` sets `historyFromSeq = lastSeq + 1`. Checks active users (`422 room.user_not_found`) and the group size limit (`422 room.group_full`). `200`: the added `MembershipView[]`. | `member_joined` per added user |
| `DELETE /group-dms/:id/members/:userId` | — | Removes the membership and the user's overrides. Targeting oneself behaves as leave (below). `204`. | `member_kicked` |
| `PUT /group-dms/:id/admins/:userId` | — | Target must be a member (`404 room.membership_not_found`). Writes `allow`. `204`. | `permission_override_changed` (user, `allow`) |
| `DELETE /group-dms/:id/admins/:userId` | — | Writes `deny` (F10). If this leaves the group without an admin, the group is deleted (below). `204`. | `permission_override_changed` (user, `deny`) |

**Group size limit.** 50 members including the creator. This is the bound
`POST /group-dms` already enforces (`userIds.max(50)`); it becomes a check on
the total at add time.

**Leaving** (`POST /rooms/:id/leave` on a `group_dm`, extended in
`MembershipService.leave`): it also deletes the leaver's
`RoomMemberPermission` rows (F3). If no member with an `allow`
`room.manage_members` override remains afterwards, the group is deleted.

**Group deletion** (last admin leaving, removed or self-revoked), in the same
transaction, in this order:

1. append `room_deleted`, so fan-out still reaches every current member;
2. set `room.deletedAt`;
3. delete every membership and every `RoomMemberPermission` of the room.

Every later read answers `404 room.not_found` (`findRoomOrThrow` checks
`deletedAt`), so nobody sees past messages. Messages stay in the database
until retention or a later purge, like any soft-deleted room.

**Creation** (`POST /group-dms`) is unchanged apart from S3: the creator is
the first admin through the existing override.

### Cross-cutting server work

- Protocol: [rooms-and-permissions.md](../../../docs/protocol/rooms-and-permissions.md)
  documents `GET /me/conversations`, `GET /me/contacts`, the `/group-dms/:id/*`
  endpoints, the admin override semantics, group deletion, the history floor
  on message reads and sync, `dm` leave setting the floor, and reappearance.
  [identity.md](../../../docs/protocol/identity.md) documents `id` on the public
  profile. [messages-and-interactions.md](../../../docs/protocol/messages-and-interactions.md)
  and [synchronisation.md](../../../docs/protocol/synchronisation.md) mention
  the floor. `docs/protocol/CHANGELOG.md` is updated: the endpoints and the
  profile `id` are additive, the history floor is a behaviour change, per
  [SDK packaging and protocol policy](../../../docs/technical/sdk-packaging-and-protocol-policy.md).
- [permission-model.md](../../../docs/technical/permission-model.md): the
  group admin section is updated (the override is now effective through
  dedicated endpoints; revoking writes `deny`).
- `bun run openapi:emit`; new error codes `room.user_not_found` and
  `room.group_full` in `conversations.errors.ts`.
- Hurl files under `apps/server/http/`: `dm/list-conversations.hurl`,
  `dm/contacts.hurl`, `dm/group-manage.hurl`, `dm/delete-dm.hurl`, with the
  `http/README.md` layout kept in sync.
- `apps/server/CHANGELOG.md` entries under `## [Unreleased]`.
- Tests, in e2e specs (`conversations-dm`, `conversations-messages`,
  `conversations-membership`):
  - floor on each read path (list, get, pins, sync, reaction on a hidden
    message);
  - `dm` delete then reappearance with only new messages;
  - `POST /dms` reopening a hidden conversation;
  - listing visibility before and after the first message, and ordering;
  - contacts scope: shared room only, excludes self and inactive users, LIKE
    escaping;
  - each group endpoint, as admin and as non-admin (`403`), and on a non-group
    room (`404`);
  - `history: "none"` hiding past messages;
  - the group size limit;
  - leave clearing overrides;
  - group deletion on the last admin leaving, being removed, or self-revoking,
    with `room_deleted` delivered to members and `404` afterwards.

  Unit tests for `HistoryFloorService` and the `writeMemberOverride` refactor.

## 3. SDK bindings (`packages/sdk`)

- New resource `conversations` (`resources/conversations.ts`):
  - `list(): Promise<ConversationListResponse>`;
  - `createDm(userId): Promise<Room>`;
  - `createGroup({ userIds, name? }): Promise<Room>`;
  - `rename(roomId, name | null): Promise<Room>`;
  - `addMembers(roomId, { userIds, history? }): Promise<Membership[]>`;
  - `removeMember(roomId, userId): Promise<void>`;
  - `grantAdmin(roomId, userId): Promise<void>`;
  - `revokeAdmin(roomId, userId): Promise<void>`;
  - `searchContacts(query): Promise<ContactsResponse>`.
- Leaving a group or deleting a `dm` reuses `rooms.leave`.
- `wire.ts` re-exports the regenerated `ConversationListItem`,
  `ConversationListResponse` and `ContactsResponse`; `PublicProfileView` gains
  `id`.
- Tests next to the resource (`conversations.test.ts`, fetch mock) and a
  changeset (`bunx changeset`, minor).

## 4. Web client (`apps/client-web`)

### 4.1 Feature layout

`src/features/direct-messages/{api,components,hooks,lib}`. Query keys under
`['conversations', ...]`, strings under `directMessages.*` in both
`common.json` catalogues, and every call through `@ekozhq/sdk`. The feature
imports `RoomChat` from `features/chat`, the same composition the rooms route
already does in a route file.

### 4.2 Sidebar section

`routes/_app/dms.tsx` registers `registerSidebarSection({ id:
'direct-messages', order: 20, component: SidebarConversations })`, below the
room tree (`order: 10`). The section contains:

- a "Direct messages" title with a "New" link (`/dms/new`);
- the conversations from `useConversations()`, in server order: avatar
  (other person's avatar, or a stacked initials badge for a group), display
  name (rule in S2) and the existing unseen dot;
- an empty state inviting the user to start a conversation.

### 4.3 Routes

- `/dms/new`: the picker (4.6).
- `/dms/$roomId`: `ConversationGate`, then `ConversationHeader` and `RoomChat`
  (`membership: 'member'`).
- `/dms/$roomId/settings`: group settings (4.7), under the same gate and
  header. Only for a `group_dm`; a `dm` redirects to `/dms/$roomId`.
- `/rooms/$roomId` for a `dm` / `group_dm` id: `RoomGate` redirects to
  `/dms/$roomId` when `GET /rooms/:id` returns one of these types (a one-line
  change in `use-room-access`, keyed on the type, with no import of the new
  feature).

### 4.4 `ConversationGate`

Resolves access in this order:

1. the conversation from the cached `useConversations()`;
2. otherwise `GET /rooms/:id`, readable when it succeeds with a
   `dm` / `group_dm` type. This covers a recipient following a link before
   the first message, or a stale list;
3. `403` / `404` show a neutral "conversation not available" state.

Capabilities come from `useMyPermissions` (existing hook). Loading and error
states match `RoomGate`.

### 4.5 Header

`ConversationHeader` shows the avatar and display name; the `dm` header also
shows the other person's identifier. Actions:

- a `dm` gets "Delete the conversation", behind a confirmation dialog. It
  calls `rooms.leave`, invalidates the conversations list and navigates to `/`;
- a group gets "Settings" (every member, for the member list and leaving).

### 4.6 New conversation picker

`/dms/new`: a search field (debounced 250 ms).

- From 2 characters it calls `searchContacts`.
- When the input matches the identifier shape `name/server` (never an email,
  F13), it also calls `users.getProfile` and lists the exact match first.
- Selecting people builds a chip list. With one person, "Start" calls
  `createDm` (get-or-create). With two or more, an optional name field
  appears and "Create group" calls `createGroup`.
- Both navigate to `/dms/$roomId` and invalidate the conversations list. Error
  codes map to messages (`room.user_not_found`, `room.group_full`,
  `room.dm_self`).

The feature also exports `StartConversationButton({ userId })` (get-or-create
then navigate). [`web-client-members`](../web-client-members/overview.md)
places it in the member profile, whichever of the two features ships second.

### 4.7 Group settings

Participants from the S2 list item, with an admin badge. For admins
(`room.manage_members` in capabilities):

- rename;
- add members (the picker component reused, plus a "show past messages"
  choice mapped to `history`);
- remove a member;
- promote or demote an admin.

Every member can leave. When the caller is the only admin, the leave and
self-demote confirmations warn that the group will be deleted for everyone.
After a leave, a removal of oneself or a deletion, the page invalidates the
conversations list and navigates to `/`.

### 4.8 Freshness and realtime

- `useConversations()` refetches on window focus and after every mutation of
  this feature.
- A `useRoomEvents` subscriber in the feature invalidates the list on:
  - `message_created` for a `roomId` absent from the conversations list and
    from the rooms list (a new or reappearing conversation);
  - `room_updated`, `member_joined`, `member_kicked`, `member_left` and
    `permission_override_changed` on a listed conversation;
  - `room_deleted`.

  When the active conversation is deleted, or the caller is removed from it,
  the page navigates to `/` with a toast. `room_created` is ignored (visibility
  rule of S2).

### 4.9 Tests and definition of done

Vitest + Testing Library with `@ekozhq/sdk` mocked:

- display-name builder;
- `SidebarConversations`: order, empty state, unseen dot;
- `ConversationGate`: each state, including the `GET /rooms/:id` fallback;
- header delete flow;
- picker: search threshold, exact identifier, email not looked up, 1 vs 2+
  selection, error mapping;
- group settings: admin vs non-admin gating, history choice, last-admin
  warning;
- realtime invalidation and redirect;
- the `/rooms/$roomId` redirect.

`bun run typecheck`, `lint` and `lint:boundaries` green;
`apps/client-web/CHANGELOG.md` entries. A
`docs/technical/web-client-direct-messages.md` page records the routes, the
gate, the history floor and the admin model once shipped.

## 5. Alternatives considered

| Point | Retained | Rejected | Why |
|-------|----------|----------|-----|
| Admin storage | Existing user override `room.manage_members` | `Membership.isAdmin` column; new `group_admin` role | Already the documented "light `room_admin`", no migration, visible through `my-permissions`; a column adds a second authorization path, a role is a heavier protocol change. User choice. |
| Group management routes | Dedicated `/group-dms/:id/*` | Generic `PATCH /rooms/:id`, `DELETE /rooms/:id/members/:userId` with `group_dm` special cases | Generic routes check `space.manage` / `room.kick`, which must not be widened for groups; dedicated routes keep each rule in one place. User choice. |
| Revoking an admin | Write `deny` | Delete the override row; new "removed" event shape | `deny` equals the `member` default, reuses the fixed `permission_override_changed` shape (F10). |
| Last admin self-revoking | Deletes the group | `409 room.last_admin` | Same outcome as the last admin leaving. User choice. |
| History limits | One per-member floor (`historyFromSeq`) for both "added without history" and "deleted `dm`" | Hide-only `dm` delete (full history back); a separate mechanism per case | One mechanism gives the preferred product behaviour for both. User choice. |
| Hidden events on the stream | Forward them, content unreachable (F9) | Filter fan-out per member floor | Events only carry ids; filtering would cost a floor lookup per fanned-out row. |
| Conversations listing | `GET /me/conversations` with participants | `GET /rooms?types=dm,group_dm`; participants fetched per room | `RoomListItem` is tree-shaped (`access`, `role`); embedding participants avoids N member queries for naming. |
| Search scope | Shared-room users + exact identifier | All local users | Product decision (overview). |
| Search route | `GET /me/contacts` | `GET /users/search` | `users/:identifier` would shadow it across controllers; the result is relative to the caller. |
| Conversation UI | Own routes `/dms/*` and gate | Extending `RoomGate` / `/rooms/$roomId` | `useRoomAccess` is built around the space tree (F11); a separate gate keeps both simple. |

## 6. Consequences

- Behaviour change: members with a floor no longer read older messages
  through the API. It only affects rows written by this feature (the floor
  starts `null`).
- A deleted `dm` whose other participant never writes stays hidden forever;
  reopening it from the picker shows only messages after the deletion.
- The hidden-message `messageId` on the stream (F9) reveals that an old
  message was edited or reacted to, not its content.
- Deleting a group is irreversible for its members; messages remain in the
  database until retention or a purge. Account deletion of the last admin is
  not handled here: the group then keeps members with no admin. That is a
  known limitation, to revisit with account-deletion cleanup.
- `GET /me/contacts` lets a user enumerate people from their own rooms by
  prefix, which is already visible through `GET /rooms/:id/members`.
- `GET /me/conversations` is unpaginated and embeds up to 49 participants per
  group; revisit if a user holds hundreds of conversations.
- `web-client-members` only has to place `StartConversationButton`; there is
  no ordering constraint between the two features.

## Implementation task breakdown

GitHub issues in `marmotz/ekoz`, label `feature:web-client-direct-messages`. Roughly in dependency order.

Server (`apps/server`):

1. [#165: per-member history floor and deleting a one-to-one conversation](https://github.com/marmotz/ekoz/issues/165) (S1)
2. [#166: contact search, profile `id` and active-user check on DM creation](https://github.com/marmotz/ekoz/issues/166) (S3)
3. [#171: `GET /me/conversations`](https://github.com/marmotz/ekoz/issues/171) (S2), depends on #165
4. [#172: group admins, member management and group deletion](https://github.com/marmotz/ekoz/issues/172) (S4), depends on #165, #166

SDK (`packages/sdk`):

5. [#182: conversations resource and contact search](https://github.com/marmotz/ekoz/issues/182) (§3), depends on #166, #171, #172

Web client (`apps/client-web`):

6. [#183: conversations sidebar, conversation page, deleting a one-to-one conversation](https://github.com/marmotz/ekoz/issues/183) (§4.1-§4.5, §4.8), depends on #182
7. [#184: new conversation picker and `StartConversationButton`](https://github.com/marmotz/ekoz/issues/184) (§4.6), depends on #182, #183
8. [#185: group conversation settings](https://github.com/marmotz/ekoz/issues/185) (§4.7, docs page), depends on #183, #184
