# Web client room moderation — technical design

Technical design for room moderation across `apps/server`, `packages/sdk` and
`apps/client-web`. Product decisions are in [overview.md](./overview.md); this page
grounds them in the code.

Related: [rooms and permissions protocol](../../../docs/protocol/rooms-and-permissions.md),
[identity protocol](../../../docs/protocol/identity.md),
[permission model](../../../docs/technical/permission-model.md),
[web client rooms](../../../docs/technical/web-client-rooms.md),
[web client chat](../../../docs/technical/web-client-chat.md).

## 1. Findings from the current code

| # | Finding | Where | Consequence |
|---|---------|-------|-------------|
| F1 | `RoomBan` is read only by `assertNotBanned`, called from `join`, `acceptInvitation` and `createJoinRequest`. The resolver never looks at bans: a banned user still reads a `public` room (`defaultRole`), and a banned member of the parent space keeps inherited access to the channel. | [membership.service.ts:681](../../../apps/server/src/modules/conversations/membership/membership.service.ts), [permissions.service.ts:172](../../../apps/server/src/modules/conversations/permissions/permissions.service.ts) | A ban does not block access today. It has to be enforced in the resolver, and in the SQL paths that bypass it (S1). |
| F2 | `kick` and `ban` delete the membership **before** `eventLog.append`, and the fan-out targets effective members, so the target never receives `member_kicked` / `member_banned`. `effectiveMemberIds` does not look at bans either. | [membership.service.ts:545](../../../apps/server/src/modules/conversations/membership/membership.service.ts), [feed-fanout.service.ts:49](../../../apps/server/src/modules/conversations/streaming/feed-fanout.service.ts) | The target needs an account event (S6). The fan-out must leave banned users out. |
| F3 | `kick` and `ban` check only the capability. `invite` does not cap `role` (the DTO defaults it to `member`, not to the room's `defaultRole`), does not refuse an existing member, and does not refuse a banned user. `changeRole` caps the new role but not the target's current rank. | [membership.service.ts:234](../../../apps/server/src/modules/conversations/membership/membership.service.ts), [membership.service.ts:607](../../../apps/server/src/modules/conversations/membership/membership.service.ts), [membership.dto.ts](../../../apps/server/src/modules/conversations/membership/membership.dto.ts) | Hierarchy rules in S2, invitation rules in S3. |
| F4 | No endpoint lists a room's bans or the invitations it has sent. Invitations cannot be revoked. | [membership.controller.ts](../../../apps/server/src/modules/conversations/membership/membership.controller.ts) | New endpoints in S3 and S4. |
| F5 | `GET /users/:identifier` returns `{ identifier, displayName, bio, avatarUrl }`, without `id`. `findByIdentifier` accepts `name`, `name/server` (local domain only) **and an email address**. | [profile.dto.ts:32](../../../apps/server/src/modules/identity/profile/profile.dto.ts), [account.service.ts:217](../../../apps/server/src/modules/identity/accounts/account.service.ts) | `id` is added (S5). An email lookup on this public route is a separate privacy issue (see Consequences). |
| F6 | `RoomBan.reason` is nullable and there is no internal note. `BanMemberSchema.reason` is optional. | [contract.prisma:568](../../../apps/server/src/core/prisma/contract.prisma), [membership.dto.ts](../../../apps/server/src/modules/conversations/membership/membership.dto.ts) | Migration and DTO change (S4). |
| F7 | `DomainError` carries `code`, `detail`, `status`, `title`, `headers`; the filter serialises nothing else. The SDK's `ProblemDetails` / `EkozError` have no extension field. | [domain-error.ts:12](../../../apps/server/src/core/http/domain-error.ts), [problem-exception.filter.ts:50](../../../apps/server/src/core/http/problem-exception.filter.ts), [errors.ts](../../../packages/sdk/src/transport/errors.ts) | Problem+json extensions are added on both sides so `room.banned` can carry the reason (S7). |
| F8 | `GET /rooms/:id/members` returns `{ role, joinedAt, user }` and does not say whether the membership is held on the room or inherited. `GET /rooms` (`listMine`) reaches rooms through the closure table without the resolver. | [membership.service.ts:127](../../../apps/server/src/modules/conversations/membership/membership.service.ts), [rooms.service.ts:94](../../../apps/server/src/modules/conversations/rooms/rooms.service.ts) | `access` is added to `Member`; both SQL queries leave banned users out (S1). |
| F9 | Kick, ban and unban go through `ModerationService`, which writes an `audit_log` row after the delegated call. `DELETE /rooms/:id/members/:userId` is used by the e2e specs and `http/membership/kick*.hurl`; the SDK has no kick binding. | [moderation.service.ts](../../../apps/server/src/modules/conversations/moderation/moderation.service.ts), [kick.hurl](../../../apps/server/http/membership/kick.hurl) | Replacing the route with `POST /rooms/:id/kicks` breaks no SDK consumer. |
| F10 | `ROLE_RANK` is `space_admin 4 > room_admin 3 > moderator 2 > member 1 > reader 0`. `User.isOwner` is a column. By default `moderator` holds `room.kick`, `room.ban`, `room.invite` and `room.manage_members`, but not `room.manage_roles`. | [role-default-capabilities.ts](../../../apps/server/src/modules/conversations/permissions/role-default-capabilities.ts) | Hierarchy compares ranks; the owner is detected on the target through `User.isOwner`. |
| F11 | Client features cannot import each other (`eslint-plugin-boundaries`); routes compose them. The members query key lives in chat today (`['chat','members',id]`); web-client-members moves it to `shared/members` as `['members', roomId]`. `features/rooms` subscribes to no live event; `useAccountEvents` exists in `shared/realtime`. `useRoomAccess` has no `banned` state. | [eslint.config.js](../../../apps/client-web/eslint.config.js), [query-keys.ts](../../../apps/client-web/src/features/chat/api/query-keys.ts), [use-realtime.ts](../../../apps/client-web/src/shared/realtime/use-realtime.ts), [use-room-access.ts](../../../apps/client-web/src/features/rooms/hooks/use-room-access.ts) | The moderation UI lives in `features/members` (C1); the target side lives in `features/rooms` (C4). |

## 2. Server changes (`apps/server`, `conversations` module)

Same controller / service / `*.view.ts` split as the rest of the module. Cross-module
reads go through `PrismaService` or `core` readers (`lint:boundaries`).

### S1. Ban enforcement

A ban on a room **or on any ancestor** denies access (the product decision that a ban
cascades, mirroring inherited membership).

- `PermissionsService.resolveRole` first looks for a `RoomBan` on
  `{roomId} ∪ ancestors` (the closure rows it already reads). If one exists, it
  returns `null`, so `can` answers `false` for every capability, `room.read`
  included. The server owner stays exempt (`can` short-circuits before).
- New `PermissionsService.findBan(userId, roomId)` returns the nearest ban (room
  first, then the smallest closure depth) as `{ roomId, reason, bannedAt }`, or
  `null`. Used by S7 and by `assertNotBanned`, which now also covers bans on
  ancestors.
- `listMine` (`GET /rooms`): the `reach` CTE drops rooms that have a ban on
  themselves or an ancestor for the caller (`NOT EXISTS` over `room_ban` joined to
  `room_closure`).
- `listMembers`: the same `NOT EXISTS` on `m.user_id` drops banned users, so a
  banned space member no longer shows up in the channel's members.
- `FeedFanoutService.effectiveMemberIds` removes users banned on the room or on an
  ancestor.
- The `invalidateSubtree` calls already made by `ban` and `unban` flush the
  resolver cache for every descendant.

### S2. Hierarchy

New private `MembershipService.assertOutranks(actor, roomId, targetUserId)`:

- the actor is the owner → allowed;
- the target is the owner (`User.isOwner`) → `403 room.target_above_authority`;
- otherwise `rank(actorRole) > rank(targetRole)`, where both roles come from
  `permissions.effectiveRole` **ignoring bans** (new `{ ignoreBans: true }` option),
  so the rank of an inherited member counts. A target with no role (a non-member
  of a non-public room) ranks below `reader` (`-1`).

Applied to:

- **kick** (explicit membership required, unchanged: an inherited member answers
  `404 room.membership_not_found`);
- **ban** (member, inherited member or non-member);
- **change role**: `assertOutranks`, plus the existing cap
  `rank(newRole) <= rank(actorRole)` (`403 room.role_above_authority`).

New error `RoomTargetAboveAuthorityError` (`room.target_above_authority`, `403`) in
[conversations.errors.ts](../../../apps/server/src/modules/conversations/conversations.errors.ts).

### S3. Invitations

`POST /rooms/:id/invitations` (needs `room.invite`):

- body `{ userId, role?, liftBan? }`. `role` has no schema default anymore; the
  service uses the room's `defaultRole`. `role` above the inviter's rank →
  `403 room.role_above_authority` (owner exempt);
- target already has an explicit membership → `409 room.already_member`;
- target banned **on this room** and `liftBan` is not `true` →
  `409 room.invitee_banned` (new error). With `liftBan: true`, the inviter also
  needs `room.ban`, otherwise `403 room.permission_denied`. The ban row is deleted
  and `member_unbanned` appended in the same transaction as the invitation, and
  `moderation.unban` is audited. A ban on an **ancestor** cannot be lifted from
  here: `409 room.invitee_banned` with `detail` naming the space (the ban has to be
  lifted there).

New endpoints:

- `GET /rooms/:id/invitations` (needs `room.invite`): pending invitations of the
  room, newest first, paginated `?cursor=&limit=` like join requests
  (`rooms.directory_page_size`). Item
  `{ id, role, createdAt, user: UserSummary, invitedBy: UserSummary }`.
- `DELETE /rooms/:id/invitations/:invitationId` (needs `room.invite`): revokes a
  pending invitation by deleting its row (the unique `(roomId, userId)` key lets a
  later invitation start fresh). Pushes an account event
  `{ type: 'invitation_revoked', invitationId }` to the invitee. `404
  room.invitation_not_found`, `409 room.invitation_already_resolved`.

### S4. Bans

- Migration: `RoomBan` gains `note String?`. `reason` stays nullable in the schema
  (existing rows); it becomes **required** in the API.
- `BanMemberSchema`: `{ userId, reason: string (1..500, trimmed), note?: string (1..2000) }`.
- `ban` runs `assertOutranks`, then the existing upsert. The `member_banned` event
  keeps `{ userId, reason }`; the note is never written to a room event. It goes
  into `audit_log` metadata (visible in the moderation log, which already requires a
  moderation capability).
- `GET /rooms/:id/bans` (needs `room.ban`): bans set **on this room** (an ancestor's
  bans are listed on the ancestor), newest first, paginated like join requests. Item
  `{ user: UserSummary, reason, note, bannedBy: UserSummary, bannedAt }`.

### S5. Kick and identifier lookup

- `POST /rooms/:id/kicks` with `{ userId, reason? }` (`reason` 1..500) replaces
  `DELETE /rooms/:id/members/:userId`. Same capability, errors and event, plus
  `room.target_above_authority`. `member_kicked` content becomes
  `{ userId, reason }` (reason `null` when missing).
- `GET /users/:identifier` adds `id` to `PublicProfileView` (the id is already public
  through every `UserSummary`).

### S6. Target notification

`kick` and `ban` push, in their transaction, an account event to the target:
`{ type: 'member_removed', kind: 'kicked' | 'banned', reason: string | null }`,
with `roomId` set by `pushAccountEvent`. For a ban set on a space, one event carries
the space's `roomId`; the client drops every room of that subtree (C4).

### S7. `room.banned` with extensions

- `DomainError` gains an optional `extensions: Record<string, unknown>`. The filter
  spreads it into the problem body (reserved RFC 9457 keys and `code` / `requestId`
  cannot be overwritten). The shared `ProblemDetailsDto` documents
  `additionalProperties`.
- `RoomBannedError` takes `{ roomId, reason, bannedAt }` as extensions (`roomId` is
  the room holding the ban, possibly an ancestor).
- `getRoom` calls `permissions.findBan` before `assertCan('room.read')` and throws
  `RoomBannedError` with the ban. `join`, `acceptInvitation` and `createJoinRequest`
  throw it with extensions as well.
- The ban **note** is never put in extensions.

### S8. Protocol and docs

Update [rooms-and-permissions.md](../../../docs/protocol/rooms-and-permissions.md)
(kicks, bans list and body, invitations list / revoke / `liftBan`, `Member.access`,
ban cascade, hierarchy, `room.banned` extensions, account events `member_removed` and
`invitation_revoked`), [identity.md](../../../docs/protocol/identity.md) (`id` in the
public profile), [permission-model.md](../../../docs/technical/permission-model.md)
(bans in the resolution order), and the Hurl collection (`kick*.hurl` rewritten; new
files for bans, invitations and hierarchy).

## 3. SDK (`packages/sdk`)

Types regenerated through the existing pipeline (`openapi:emit` → `bun run generate`
→ `wire.ts`). A changeset (minor) for every change below.

- `rooms`: `invite(roomId, { userId, role?, liftBan? })`,
  `listInvitations(roomId, params?)`, `revokeInvitation(roomId, invitationId)`,
  `kick(roomId, { userId, reason? })`, `ban(roomId, { userId, reason, note? })`,
  `unban(roomId, userId)`, `listBans(roomId, params?)`,
  `changeRole(roomId, userId, role)`. `members()` returns `access`.
- `users.getProfile` returns `id`.
- `ProblemDetails` gains an index signature; `EkozError` gains
  `readonly extensions: Readonly<Record<string, unknown>>` (the non-standard keys of
  the body, `{}` when none). A typed helper `banDetails(error)` returns
  `{ roomId, reason, bannedAt } | null` for a `room.banned` error.
- `AccountStreamEvent` stays open-ended; exported discriminated types
  `MemberRemovedAccountEvent` and `InvitationRevokedAccountEvent` document the new
  payloads.

## 4. Web client (`apps/client-web`)

### C1. Ownership

All moderator-side code lives in `features/members`, created by
[`web-client-members`](../../_archives/features/web-client-members/technical.md) (panel, `member-row`). The
members query (`roomMembersKey`, `useRoomMembers`) and its live refresh
(`useMembersLive`) live in `shared/members`; the lookup card and `usePublicProfile`
in `shared/profile` (web-client-members 6.1, 6.2, 6.4). The target side (removal,
banned screen) lives in `features/rooms`. No feature imports another; the
`/rooms/$roomId` route composes them and passes `room` and `capabilities` from the
`RoomGate` render props to `MembersPanel`.

### C2. Members panel additions

Each action is shown only with its capability (from the `RoomGate` render props) and
when the rank rule allows it, computed client-side from the caller's `role` (rooms
list item) and `useMe().isOwner`. The server stays the authority, and its errors map
to messages.

- **Member row menu**: Change role (explicit membership, `room.manage_roles`, target
  below the caller, roles up to the caller's), Kick (explicit membership,
  `room.kick`, optional reason), Ban (`room.ban`, required reason plus an optional
  note). An inherited member shows its origin ("via <space>") and only Ban.
- **Invite** (`room.invite`): an identifier field → `users.getProfile` → a profile
  card (avatar, name, identifier) → role select (default `room.defaultRole`, capped
  at the caller's role) → Send. An input containing `@` is rejected client-side
  (identifier only). On `room.invitee_banned`: with `room.ban`, a confirmation
  stating that the ban will be lifted, then a retry with `liftBan: true`; without
  it, an error message.
- **Pending invitations** section (`room.invite`): infinite list, Revoke per row.
- **Bans** section (`room.ban`): infinite list (user, reason, note, banned by,
  date), Unban per row, and "Ban a user" by identifier with the same lookup card as
  Invite.

Query keys (members feature): `['members','bans',roomId]`,
`['members','invitations',roomId]`. Invalidation: kick / ban / role change →
`roomMembersKey(roomId)`; ban / unban → bans list and members list; invite / revoke →
invitations. They run on failure too (a `404` / `409` means the list was stale). The
lookup card reuses `usePublicProfile(identifier)`, which now exposes `id` (S5).

### C3. Live refresh (moderator side)

`useMembersLive` (web-client-members 6.2) already invalidates the members list on
every `member_*` and `role_changed` event. `features/members` adds
`useModerationLive(roomId)`: `member_banned` and `member_unbanned` → bans list;
`member_joined` → invitations (an invitation was accepted). It is mounted by
`MembersPanel` when the caller holds `room.ban` or `room.invite`.

### C4. Target side (`features/rooms`)

- New `useRoomsRealtime`, mounted once by `SidebarRooms`, subscribes to
  `useAccountEvents`:
  - `member_removed` → stores `{ kind, reason }` under
    `['rooms','removal',roomId]` (`setQueryData`, no fetch) and invalidates `list`,
    plus `detail` and `permissions` for the room and every listed descendant;
  - `invitation_created` / `invitation_revoked` → `invitations`.
- `useRoomAccess` gains two states, checked before the others:
  - `removed`: a removal entry exists for the room or an ancestor → "You were
    removed from / banned from this room" plus the reason and a link back to
    `/rooms`. The entry is cleared when leaving the route;
  - `banned`: `GET /rooms/:id` fails with `room.banned` → the reason from
    `banDetails(error)`, and the space name when `roomId` is an ancestor.
- Strings under `rooms.moderation.*` and `members.moderation.*` in the French and
  English catalogues.

## 5. Alternatives considered

| Topic | Retained | Rejected | Why |
|-------|----------|----------|-----|
| Identifier resolution | `id` in `GET /users/:identifier`, the client resolves first | `identifier` in the invite / ban bodies | The profile card lets the moderator confirm the person before acting; no body change; `conversations` would otherwise need a new `core` identifier reader. |
| Ban scope | Cascades to descendants, enforced in the resolver | Per room only | Mirrors inherited membership; otherwise a space ban leaves every channel open. |
| Ban reason for the target | Problem+json extensions on `room.banned` | `GET /rooms/:id/my-ban`; extending the preview | User's choice: the gate already calls `GET /rooms/:id` first, so no extra request; extensions are reusable by other errors. |
| Lifting a ban by invitation | Explicit `liftBan`, requires `room.ban` | Implicit lift; `room.invite` alone | Keeps the lift a deliberate act, and a plain `room.invite` holder cannot bypass a ban. |
| Kick reason transport | `POST /rooms/:id/kicks` | `DELETE` with a body; `?reason=` | DELETE bodies are dropped by some intermediaries; a query string ends up in access logs. Symmetric with `POST /rooms/:id/bans`. |
| Revoking an invitation | Delete the row | `revokedAt` column | The unique key already makes re-invitation a reset; audit covers traceability. |
| Client placement | `features/members` owns moderation | Separate `features/moderation` composed through route slots | Same data and query keys, direct invalidation, no slot plumbing. |
| Target notification | Account event `member_removed` | Emitting the room event before deleting the membership | Account events already exist for invitations; reordering would leak later room events and still misses the reason for the ancestor-ban case. |

## 6. Consequences

- **Security fixes** shipped with this feature: bans actually deny access (F1), the
  hierarchy is enforced (F3), and the invitation role is capped. The e2e specs in
  `conversations-moderation.e2e-spec.ts` and `conversations-membership.e2e-spec.ts`
  that kick through `DELETE` are rewritten; new specs cover the cascade, fan-out
  exclusion, members and rooms list exclusion, hierarchy for each action, `liftBan`
  with and without `room.ban`, and extensions on `room.banned`.
- **Breaking protocol changes**: `DELETE /rooms/:id/members/:userId` is removed;
  `reason` becomes required on `POST /rooms/:id/bans`; the invitation role defaults
  to `defaultRole`; inviting a member or a banned user now fails. No SDK method
  existed for kick, ban or invite, so no SDK consumer breaks.
- `permissions.effectiveRole` gains an option; the resolver does one extra
  `room_ban` read per cache miss (same closure ids, indexed by the primary key).
- `web-client-members` (#123 to #128) must ship first: the panel, `member-row`,
  `shared/members` and `shared/profile` are its deliverables.
- Out of scope, flagged: `GET /users/:identifier` accepts an email address (F5),
  which allows profile lookup by email. To handle separately.
- A design page under `docs/technical/` records the ban cascade, the hierarchy rule
  and the problem+json extensions when the feature ships.

## Implementation tasks

In delivery order. Client tasks also depend on `web-client-members` (#125 to #127).

- [#142](https://github.com/marmotz/ekoz/issues/142): Server: enforce bans in the resolver, cascade to descendants, `Member.access` (S1)
- [#151](https://github.com/marmotz/ekoz/issues/151): Server: problem+json extensions and `room.banned` with ban details (S7)
- [#159](https://github.com/marmotz/ekoz/issues/159): Server: role hierarchy, `POST /rooms/:id/kicks` with reason, `member_removed` account event, `id` in public profile (S2, S5, S6)
- [#160](https://github.com/marmotz/ekoz/issues/160): Server: required ban reason, internal note, `GET /rooms/:id/bans` (S4)
- [#161](https://github.com/marmotz/ekoz/issues/161): Server: invitation rules, `liftBan`, list and revoke room invitations (S3)
- [#162](https://github.com/marmotz/ekoz/issues/162): SDK: moderation bindings, error extensions, account event types (3)
- [#163](https://github.com/marmotz/ekoz/issues/163): Client: removed and banned screens, rooms account events (C4)
- [#164](https://github.com/marmotz/ekoz/issues/164): Client: member actions in the members panel: role, kick, ban (C1, C2)
- [#167](https://github.com/marmotz/ekoz/issues/167): Client: invite, pending invitations and bans sections (C2, C3)
- [#170](https://github.com/marmotz/ekoz/issues/170): Docs: `docs/technical/room-moderation.md`
