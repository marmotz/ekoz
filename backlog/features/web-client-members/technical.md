# Web client members — technical design

**Status**: technical design. Follows the decisions in [overview.md](./overview.md).
No code is changed by this document.

## 1. Scope

A collapsible members panel next to a room's content and a public profile card
opened from the panel, from message authors and from the user menu, in
`apps/client-web`, through `@ekozhq/sdk`. Authors who left a room get their name back
instead of "Unknown user".

| Workspace         | Work                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------- |
| `apps/server`     | `GET /users?ids=`: user summaries by id (S1).                                          |
| `docs/`           | Protocol page and changelog, OpenAPI, one technical page.                              |
| `packages/sdk`    | `users.summaries(ids)` binding and its type.                                           |
| `apps/client-web` | `shared/members` (shared members query), `shared/profile` (card), `features/members` (panel), chat and user menu integration, route composition. |

Out of scope: presence and the "hide offline members" filter
([`web-client-presence-and-typing`](../web-client-presence-and-typing/overview.md));
member-level actions in the card (direct message, invite, role change, remove, ban),
added by [`web-client-direct-messages`](../web-client-direct-messages/overview.md) and
[`web-client-room-moderation`](../web-client-room-moderation/overview.md); the panel in
`dm` / `group_dm` rooms (reused by `web-client-direct-messages`).

## 2. Verified findings

| #   | Finding | Evidence | Consequence |
| --- | ------- | -------- | ----------- |
| F1  | `GET /rooms/:id/members` returns the effective members ordered by user id, pages of `limit` (default 100, max 200), with `{ role, joinedAt, user: UserSummary }`. It needs `room.read` only, so a non-member reading a public room gets it too. | [membership.service.ts:127](../../../apps/server/src/modules/conversations/membership/membership.service.ts), constants at [membership.service.ts:56](../../../apps/server/src/modules/conversations/membership/membership.service.ts) | No server change for the list. Sorting by role or name and searching are client-side, on the whole list. |
| F2  | The chat already loads that list for author names: `fetchMembers` follows the cursor up to `MAX_MEMBER_PAGES = 5` pages of the default size (500 members), under the key `['chat', 'members', roomId]`. | [queries.ts:5](../../../apps/client-web/src/features/chat/api/queries.ts), [query-keys.ts](../../../apps/client-web/src/features/chat/api/query-keys.ts), [use-authors.ts:29](../../../apps/client-web/src/features/chat/hooks/use-authors.ts) | The panel and the chat must share one query, or a room open with the panel fetches the list twice. A feature cannot import another (eslint boundaries matrix in [eslint.config.js](../../../apps/client-web/eslint.config.js)), so the query moves to `shared`. |
| F3  | The members cache is invalidated on `member_joined` only, from `useTimelineSync`, mounted by `RoomChat`. | [use-timeline-sync.ts:78](../../../apps/client-web/src/features/chat/hooks/use-timeline-sync.ts) | Leaves, kicks, bans and role changes do not refresh the list. The SDK event union already has `member_left`, `member_kicked`, `member_banned`, `member_unbanned`, `role_changed` ([events.ts:49](../../../packages/sdk/src/types/events.ts)). |
| F4  | An author missing from the members list resolves to `kind: 'unknown'` and renders "Unknown user"; a null author or a null `displayName` is `deleted`. | [use-authors.ts:57](../../../apps/client-web/src/features/chat/hooks/use-authors.ts), [message-item.tsx:22](../../../apps/client-web/src/features/chat/components/message-item.tsx) | Chat limitation L1. Fixing it needs a lookup of users who are no longer members. |
| F5  | `UserSummaryReader.readMany(ids)` lives in `core` and summarises any user id; an unknown or deleted id comes back with null `identifier`, `displayName`, `avatarUrl`. | [user-summary.reader.ts:33](../../../apps/server/src/core/users/user-summary.reader.ts) | S1 is a thin controller over an existing reader. |
| F6  | `GET /users/:identifier` returns `{ identifier, displayName, bio, avatarUrl }`, 404 for a deleted account or one without `name`. The SDK binding is `users.getProfile(identifier)`. | [profile.controller.ts:113](../../../apps/server/src/modules/identity/profile/profile.controller.ts), [profile.service.ts:80](../../../apps/server/src/modules/identity/profile/profile.service.ts), [users.ts](../../../packages/sdk/src/resources/users.ts) | The card reads the bio there. `/users/:identifier` and a new `GET /users` do not collide. |
| F7  | Only a deleted account has no `name`: deletion sets it to null, registration requires it. Deleted accounts keep their `Membership` rows, so they stay in the members list with an empty summary. | [lifecycle.service.ts:144](../../../apps/server/src/modules/identity/accounts/lifecycle.service.ts), [identity.md `POST /auth/register`](../../../docs/protocol/identity.md) | "No identifier" means "deleted". The panel filters them out (overview decision). |
| F8  | Membership roles are `space_admin`, `room_admin`, `moderator`, `member`, `reader`; the server owner is a flag, not a role. | [contract.prisma:341](../../../apps/server/src/core/prisma/contract.prisma) | Five role sections; the owner shows under the role of their membership. |
| F9  | The room route composes `RoomGate`, `RoomHeader` (rooms) and `RoomChat` (chat), a child page replacing the chat. `RoomHeader` has no slot for another feature's control. | [$roomId.tsx](../../../apps/client-web/src/routes/_app/rooms/$roomId.tsx), [room-header.tsx:30](../../../apps/client-web/src/features/rooms/components/room-header.tsx) | The route places the panel; `RoomHeader` gets an `actions` slot for the toggle. |
| F10 | The user menu (auth) lists registered entries and sign out; `useMe` returns `identifier`, `displayName`, `bio`, `avatarUrl`. There is no popover primitive (`@radix-ui/react-popover` is not installed); `sheet`, `dialog`, `dropdown-menu`, `user-avatar` exist. | [user-menu.tsx](../../../apps/client-web/src/features/auth/components/user-menu.tsx), [use-me.ts](../../../apps/client-web/src/shared/sdk/use-me.ts), [package.json](../../../apps/client-web/package.json), [shared/ui](../../../apps/client-web/src/shared/ui/) | Add the shadcn/ui `popover` (new dependency). |
| F11 | Local preferences follow the `useCollapsedRooms` pattern: `localStorage` under an `ekoz.*` key, read and write wrapped in `try`. | [collapsed-rooms.ts](../../../apps/client-web/src/features/rooms/components/collapsed-rooms.ts) | Same pattern for the panel preferences. |
| F12 | Role labels exist only under `rooms.invitations.role.*`, lower case, phrased for "as {{role}}". Feature strings live under a feature prefix in `common.json`. | [common.json:411](../../../apps/client-web/src/shared/i18n/locales/en/common.json) | New `members.*` keys, own role labels (section titles). |
| F13 | SDK wire types are generated from the OpenAPI description and aliased in `types/wire.ts` (`Member`, `UserSummary`). | [wire.ts:42](../../../packages/sdk/src/types/wire.ts) | S1 lands in `openapi.json` first; the SDK regenerates and aliases the new list type. |

## 3. Decisions

| Topic | Retained | Alternatives | Why |
| ----- | -------- | ------------ | --- |
| Resolving users who left | `GET /users?ids=` returning `UserSummary` per id (S1) | Room-scoped `GET /rooms/:id/users?ids=`; embedding `author: UserSummary` in messages and events | Reuses `readMany`; serves authors, mentions (current display name of a mentioned user who left) and the card. A room scope would need the event log, since memberships are deleted on leave. Embedding fixes authors only and grows every payload. Summaries hold nothing that `GET /users/:identifier` does not already expose. |
| Members list size | Client loads pages of 200 up to 10 pages (2,000 members); beyond, the panel says the list is truncated | Server search and role/name sort with infinite scroll; keeping 500 | No protocol change; grouping, counts and search stay simple. A demo client does not target larger rooms. |
| One members query | Moved to `shared/members`, key `['members', roomId]`, used by chat and panel | Each feature fetching its own | One request per room; features cannot import each other (F2). |
| Card location | `shared/profile`: the card and its query | Inside `features/members` | Opened from chat, members and auth; only `shared` is importable by all three. |
| Card primitive | Popover (shadcn/ui on `@radix-ui/react-popover`) | Dialog; hover card | Overview decision; anchored to what was clicked, keyboard accessible. |
| Own profile from the menu | Menu entry opens the same card anchored to the menu trigger | A `/users/$identifier` page | Same component, no route (overview). |
| Panel on small screens | `Sheet` from the right below `lg`, inline column from `lg` | Always a sheet | Matches "chat stays visible" on desktop; `sheet` exists. |
| Header toggle | `RoomHeader` gets an `actions?: ReactNode` slot filled by the route | The header importing members; a registry | Same composition style as the route already uses (F9); a single consumer does not justify a registry. |
| Deleted accounts | Filtered out of the panel and its counts | Listed with 💀 | Overview decision; they cannot act in the room. |
| Live refresh | Invalidate `['members', roomId]` on every membership event (F3 list) | `member_joined` only | Role sections and counts must follow leaves, bans and role changes. |
| Card actions | No action slot in this feature | A registry now | Nothing registers yet; `web-client-direct-messages` adds the slot with its first action. |

## 4. Server changes (`apps/server`)

### S1. `GET /users?ids=`

In `UsersController` ([profile.controller.ts:108](../../../apps/server/src/modules/identity/profile/profile.controller.ts)),
authenticated like the rest of `/users`.

- Query: `ids`, a comma-separated list of 1 to 100 ULIDs, validated with
  `entityIdSchema` after split; duplicates are collapsed.
- `200`: `{ items: UserSummary[] }`, one item per distinct requested id, in request
  order. An unknown or deleted id is summarised like a deleted account (all nullable
  fields `null`), as `readMany` does (F5): the endpoint never reveals whether an id
  existed.
- Errors: validation (`422`) for an empty list, more than 100 ids or a malformed id.
- `identity` reads through `UserSummaryReader` (`core`), so no module boundary is
  crossed.
- OpenAPI: response DTO `UserSummaryListViewDto`; `apps/server/openapi.json`
  regenerated.
- Protocol: new section in [identity.md](../../../docs/protocol/identity.md) under
  "Public profiles"; entry in [CHANGELOG.md](../../../docs/protocol/CHANGELOG.md).

Tests: controller e2e (auth required, order, duplicates, deleted and unknown ids,
101 ids and bad id rejected); Hurl scenario next to the existing `/users` ones.

## 5. SDK (`packages/sdk`)

- `users.summaries(ids: readonly string[]): Promise<UserSummary[]>` in
  [users.ts](../../../packages/sdk/src/resources/users.ts): `GET /users` with
  `query: { ids: ids.join(',') }` (query values are scalars), returns `items`. It
  does not split: callers pass at most 100 ids.
- `UserSummaryList` alias in `types/wire.ts` and its schema export, like `MembersPage`.
- Unit test with the fake transport; changeset (minor).

## 6. Client architecture (`apps/client-web`)

```
src/shared/members/
  room-members.ts        fetchRoomMembers, roomMembersKey, useRoomMembers(roomId)
  use-user-summaries.ts  useUserSummaries(ids): batched GET /users?ids=
src/shared/profile/
  profile-card.tsx       ProfileCard (content) + ProfileCardPopover (trigger wrapper)
  use-public-profile.ts  ['users', 'profile', identifier] -> users.getProfile
src/shared/ui/popover.tsx
src/features/members/
  components/  members-panel, members-toggle, member-list, member-row
  hooks/       use-members-panel-prefs, use-members-live
  lib/         group-members (filter, sort, group, search)
```

### 6.1 Shared members query

`fetchMembers` and `MAX_MEMBER_PAGES` move from `features/chat/api/queries.ts` to
`shared/members/room-members.ts`, with `limit: 200` and `MAX_MEMBER_PAGES = 10`. The
result becomes `{ members: Member[], truncated: boolean }` (`truncated` when the last
page still had a `nextCursor`). Key `['members', roomId]`; `chatKeys.members` is
removed and `use-authors` reads `useRoomMembers`.

### 6.2 Live refresh

A `useMembersLive(roomId)` hook in `shared/members` subscribes with `useRoomEvents`
and invalidates `['members', roomId]` on `member_joined`, `member_left`,
`member_kicked`, `member_banned`, `member_unbanned` and `role_changed`. It replaces
the `member_joined` branch of `useTimelineSync` and is mounted by the room route, so it
runs whether the chat or a child page is shown. Live events only reach members (chat
L3): a non-member reading a public room gets a list refreshed on open and on focus.

### 6.3 Authors who left

`use-authors` keeps the members list as its first source. For author ids missing from
it, it calls `useUserSummaries(missingIds)` (chunks of 100, key
`['users', 'summaries', sortedIds]`) instead of refetching the members list:

| Case | `Author.kind` | Rendering |
| ---- | ------------- | --------- |
| In the members list, `displayName` set | `member` (was `user`) | name, role known |
| Missing from members, summary has a `displayName` | `left` | name + 🚪 marker, card opens |
| Null author, null `displayName`, or summary all null | `deleted` | "Deleted account" + 💀, not clickable |
| Summary still loading | `pending` | name placeholder (skeleton), then one of the above |

`unknown` and the one-shot members refetch disappear. `Author` gains `userId` and
`role: RoomRole | null` (null for `left` and `deleted`).

### 6.4 Profile card

- `ProfileCard` takes `{ identifier, fallback: UserSummary-like, role?, left? }`. It
  renders avatar, display name and identifier immediately from `fallback`, loads the
  bio with `usePublicProfile(identifier)` (skeleton line while pending; on `404` the
  card keeps the fallback and shows no bio), and the role or the "left the room" note.
- `ProfileCardPopover` wraps any trigger (`asChild`) and mounts the query only when
  open.
- Entry points:
  - `member-row` in the panel;
  - the author name and avatar in `message-item.tsx`, for `member` and `left` kinds,
    rendered as a button; `deleted` stays plain text;
  - the user menu: a "My public profile" entry opens the card anchored to the menu
    trigger, content from `useMe` as fallback. It is a menu action, not a route, so it
    is added in `user-menu.tsx` directly rather than through `registerUserMenuItem`
    (which only takes a `to`).

### 6.5 Members panel

- `useMembersPanelPrefs()` stores `{ open: boolean, view: 'role' | 'alpha' }` in
  `localStorage` key `ekoz.members.panel` (F11), exposed through a small
  `useSyncExternalStore` store so the toggle and the panel stay in sync. Defaults:
  closed, `role`.
- `group-members.ts` (pure): drops deleted accounts (F7), filters by search on
  display name and identifier (case- and accent-insensitive, `localeCompare` with
  `sensitivity: 'base'`), sorts by display name then identifier, and for the `role`
  view groups in the order `space_admin`, `room_admin`, `moderator`, `member`,
  `reader`, omitting empty sections. Counts come from the filtered list; the header
  total ignores the search.
- `MembersPanel({ roomId })`: header (title, total, view switch, close), search
  field, list, truncation notice when `truncated`, loading skeleton, error with
  retry. From `lg` it is an inline column (`w-72`, left border); below, a `Sheet`
  from the right driven by the same `open` preference.
- `MembersToggle` is a header button with the count badge and `aria-expanded`.

### 6.6 Route composition

[$roomId.tsx](../../../apps/client-web/src/routes/_app/rooms/$roomId.tsx) renders
`RoomHeader` with `actions={<MembersToggle />}`, and wraps the content in a row:
`<div className="flex min-h-0 flex-1">{content}<MembersPanel roomId={room.id} /></div>`,
mounting `useMembersLive(room.id)`. The panel shows for `space` and `channel` rooms
(any access `RoomGate` renders: `member`, `invited`, `joinable`) and stays open on child
pages such as `/requests`.

### 6.7 Strings

`members.*` in `en` and `fr` `common.json`: panel title, toggle label, view names,
search placeholder, empty and no-match states, truncation notice, section titles per
role, "left the room", "My public profile", card labels. The 🚪 and 💀 markers are
text with an accessible label.

## 7. Tests

- Server: S1 e2e and Hurl (section 4).
- SDK: `users.summaries` request and parsing.
- Client, Vitest + Testing Library with `createFakeSdk` (add `users.summaries`):
  - `group-members`: deleted filtered, both views, role order, search (accents,
    identifier), counts;
  - `room-members`: page following, `truncated`, 10-page cap;
  - `use-authors`: `member`, `left` via summaries, `deleted`, `pending`, chunking;
  - `useMembersLive`: invalidation on each membership event, other rooms ignored;
  - `ProfileCard`: fallback first, bio loaded, `404` without bio, role and left note;
  - `MembersPanel` and `MembersToggle`: open state and view persisted, sheet below
    `lg`, truncation notice, error retry;
  - `message-item`: author button opens the card, deleted not clickable, 🚪 marker;
  - `user-menu`: "My public profile" opens the card;
  - route test: header toggle, panel beside chat and child page.
- Existing tests that use `chatKeys.members` or the `unknown` author kind are updated.

## 8. Documentation and changelog

- `docs/technical/web-client-members.md`: shared members query, authors resolution,
  card and panel, alternatives from section 3, limitations from section 9. Linked from
  [docs/technical/README.md](../../../docs/technical/README.md).
- [web-client-chat.md](../../../docs/technical/web-client-chat.md): L1 marked resolved,
  link to the new page.
- Protocol page and changelog (S1); SDK changeset.

## 9. Limitations

- Rooms with more than 2,000 effective members show a truncated panel, and author
  lookup falls back to `GET /users?ids=` for members beyond the cap (correct names, no
  role).
- A non-member reading a public room sees a list that refreshes on open and focus
  only (no live events, chat L3).
- `GET /users?ids=` lets any authenticated user resolve a known ULID to a public
  summary; ULIDs are not guessable and the same data is public by identifier.
- An author who left shows their current profile, not the one they had when posting.

## Implementation task breakdown

| Issue | Task | Blocked by |
| ----- | ---- | ---------- |
| [#123](https://github.com/marmotz/ekoz/issues/123) | Server: `GET /users?ids=` user summaries by id (S1) | - |
| [#124](https://github.com/marmotz/ekoz/issues/124) | SDK: `users.summaries(ids)` binding (section 5) | #123 |
| [#125](https://github.com/marmotz/ekoz/issues/125) | Client: shared members query, live refresh and authors who left (6.1 to 6.3) | #124 |
| [#126](https://github.com/marmotz/ekoz/issues/126) | Client: public profile card from authors and the user menu (6.4) | #125 |
| [#127](https://github.com/marmotz/ekoz/issues/127) | Client: members panel, header toggle and route composition (6.5 to 6.7) | #125, #126 |
| [#128](https://github.com/marmotz/ekoz/issues/128) | Docs: `docs/technical/web-client-members.md` (section 8) | #125, #126, #127 |

All issues carry the label `feature:web-client-members`.
