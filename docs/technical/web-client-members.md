# Web client members

## Context

`apps/client-web` showed a room's conversation ([web client chat](web-client-chat.md))
but not who is in the room, and it resolved message authors from the members list
only: an author who left the room appeared as "Unknown user" (chat limitation L1).
The `web-client-members` scope adds a collapsible members panel next to a room, a
public profile card opened from the panel, from message authors and from the user
menu, and the lookup that gives authors who left their name back.

Checking the product scoping against the code showed that:

- `GET /rooms/:id/members` already returns the effective members with a
  `UserSummary`, so listing, sorting by role or name and searching can stay on the
  client;
- the chat already loaded that list for author names, under a key private to the chat
  feature, and a feature may not import another: the panel could not reuse it, and a
  room open with the panel would have fetched the list twice;
- the cache was refreshed on `member_joined` only, so leaves, kicks, bans and role
  changes left the list stale;
- nothing resolves a user id to a name once the user is no longer a member, since
  memberships are deleted on leave.

The feature-level design is in
[`backlog/_archives/features/web-client-members/technical.md`](../../backlog/_archives/features/web-client-members/technical.md);
this page records what shipped and why. It builds on [web client chat](web-client-chat.md)
(authors, `shared/realtime`), [web client rooms](web-client-rooms.md) (`RoomGate`,
`RoomHeader`) and [web client account](web-client-account.md) (user menu, avatars).

## Decision

### Server, protocol and SDK

`GET /users?ids=` returns the `UserSummary` of 1 to 100 comma-separated user ids as
`{ items }`, one item per distinct id, in request order. An unknown or deleted id is
summarised like a deleted account (`identifier`, `displayName` and `avatarUrl` null),
so the endpoint never reveals whether an id existed; a validation error (`422`)
answers an empty list, more than 100 ids or a malformed id. It is a thin controller
over `UserSummaryReader` (`core`), next to `GET /users/:identifier`, and is described
in [identity.md](../protocol/identity.md) and the
[protocol changelog](../protocol/CHANGELOG.md). The SDK gains
`users.summaries(ids)` (ids joined with a comma, no splitting: callers pass at most
100) and the `UserSummaryList` type.

### Client layout and boundaries

```
src/shared/members/
  room-members.ts        fetchRoomMembers, roomMembersKey, useRoomMembers
  use-members-live.ts    useMembersLive: invalidation on membership events
  use-user-summaries.ts  useUserSummaries: GET /users?ids= in chunks of 100
src/shared/profile/
  profile-card.tsx       ProfileCard, ProfileCardPopover
  use-public-profile.ts  ['users', 'profile', identifier]
src/shared/ui/popover.tsx
src/shared/lib/use-media-query.ts
src/features/members/
  components/  MembersPanel, MembersToggle, MemberList, MemberRow
  hooks/       useMembersPanelPrefs
  lib/         groupMembers
```

### Shared members query

The members list moved from the chat to `shared/members`, the one place `chat`,
`members` and the route may all read. Pages of 200 (the server maximum) are followed
up to 10 pages, so 2,000 members; the result is `{ members, truncated }`, `truncated`
being true when the last page loaded still had a `nextCursor`. The key is
`['members', roomId]`. `useMembersLive(roomId)` subscribes with `useRoomEvents` and
invalidates that key on `member_joined`, `member_left`, `member_kicked`,
`member_banned`, `member_unbanned` and `role_changed` for the room. The room route
mounts it, so it runs whether the chat or a child page is shown; the chat no longer
handles `member_joined` itself.

### Authors: `member`, `left`, `deleted`

`useAuthors` reads the members list first; for author ids missing from it it calls
`useUserSummaries` (chunks of 100, key `['users', 'summaries', sortedIds]`) instead of
refetching the members list.

| `Author.kind` | Condition                                                          | Rendering                                   |
|---------------|--------------------------------------------------------------------|---------------------------------------------|
| `member`      | in the members list with a display name                            | name, role known, card opens                |
| `left`        | not in the list, the summary has a display name                    | name and a door marker, card opens          |
| `deleted`     | no author, or a null display name (list or summary)                | "Deleted account" and a skull, plain text   |
| `pending`     | members or summaries still loading                                 | name skeleton                               |

`Author` carries `userId` and `role` (null for `left`, `deleted` and `pending`). A
failed summary lookup leaves the author `deleted`: no name could be found, and the
next render of the list retries through the query.

### Profile card

`ProfileCard` takes `{ identifier, fallback, role?, left? }`. It draws avatar, name
and identifier at once from `fallback`, loads the bio through `usePublicProfile`
(`GET /users/:identifier`, skeleton while pending), and keeps the fallback without a
bio when the profile is empty or unreadable (`404` for a deleted account). It shows
the role, or a "left the room" note. `ProfileCardPopover` wraps a trigger and mounts
the card, so its query, only while the popover is open. The card lives in `shared`
because chat, members and auth all open it. Three entry points:

- the author name and avatar of a message (`member` and `left` only; the avatar
  button is out of the tab order since the name is the accessible control);
- a row of the members panel, with the member's role;
- a "My public profile" entry of the user menu, anchored to the menu trigger with
  `useMe` as fallback. It is a menu action, not a route, so it is added in
  `user-menu.tsx` rather than through `registerUserMenuItem`; the closing menu does
  not give focus back to its trigger while the card is open, otherwise the popover
  would dismiss itself.

### Members panel

`groupMembers` is pure: it drops deleted accounts (no identifier), filters on display
name and identifier ignoring case and accents (`localeCompare`, `sensitivity: 'base'`),
sorts by display name then identifier and, in the `role` view, groups in the order
`space_admin`, `room_admin`, `moderator`, `member`, `reader`, omitting empty sections.
Section counts come from the filtered list; the header total ignores the search.
`useMembersPanelPrefs` keeps `{ open, view }` under `ekoz.members.panel` (reads and
writes guarded like the other local preferences), through a `useSyncExternalStore`
store so the header toggle and the panel stay in sync; defaults are closed and `role`.

`MembersPanel` is an inline column (`w-72`, left border) from Tailwind's `lg`
breakpoint and a `Sheet` from the right below it, chosen by `useMediaQuery` and driven
by the same `open` preference. It has a header (title, total, view switch, close), a
search field, a truncation notice when `truncated`, a loading skeleton and an error
with retry. `RoomHeader` gets an `actions?: ReactNode` slot; the route fills it with
`MembersToggle` (button with the count and `aria-expanded`) and places the panel next
to the content, kept on child pages such as `/requests`. Both show for `space` and
`channel` rooms only; direct message rooms are left to
`web-client-direct-messages`. Strings live under `members.*` in `common.json`.

## Alternatives

| Topic                       | Chosen                                                                 | Rejected                                                                   | Why                                                                                                                                                                     |
|-----------------------------|------------------------------------------------------------------------|----------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Resolving users who left    | `GET /users?ids=` returning `UserSummary` per id                       | Room-scoped `GET /rooms/:id/users?ids=`; embedding `author` in messages and events | Reuses `readMany`; also serves mentions and the card. A room scope would need the event log, since memberships are deleted on leave. Embedding fixes authors only and grows every payload. Summaries hold nothing `GET /users/:identifier` does not already expose. |
| Members list size           | Pages of 200 up to 10 pages; beyond, the panel says it is truncated    | Server search and sort with infinite scroll; keeping 500                   | No protocol change; grouping, counts and search stay simple. A demonstration client does not target larger rooms.                                                       |
| One members query           | `shared/members`, key `['members', roomId]`, used by chat and panel    | Each feature fetching its own                                              | One request per room; features cannot import each other.                                                                                                                |
| Live refresh                | Invalidate on every membership event                                   | `member_joined` only                                                       | Role sections and counts must follow leaves, bans and role changes.                                                                                                     |
| Card location               | `shared/profile`                                                       | Inside `features/members`                                                  | Opened from chat, members and auth; only `shared` is importable by all three.                                                                                           |
| Card primitive              | Popover (shadcn/ui on `@radix-ui/react-popover`)                       | Dialog; hover card                                                         | Anchored to what was clicked, keyboard accessible.                                                                                                                      |
| Own profile from the menu   | Menu entry opening the same card                                       | A `/users/$identifier` page                                                | Same component, no route.                                                                                                                                               |
| Panel on small screens      | `Sheet` from the right below `lg`, inline column from `lg`             | Always a sheet                                                             | The chat stays visible on desktop; `sheet` already exists.                                                                                                              |
| Header toggle               | `RoomHeader` `actions` slot filled by the route                        | The header importing members; a registry                                   | Same composition style as the rest of the route; a single consumer does not justify a registry.                                                                         |
| Deleted accounts            | Filtered out of the panel and its counts                               | Listed with a skull                                                        | They cannot act in the room. They keep their marker in message authors.                                                                                                 |
| Card actions                | No action slot yet                                                     | A registry now                                                             | Nothing registers yet; `web-client-direct-messages` adds it with its first action.                                                                                      |
| Feature strings             | `members.*` in `common.json`                                           | A `members` i18next namespace                                              | Key typing derives from `common.json` only.                                                                                                                             |

## Consequences

- Rooms with more than 2,000 effective members show a truncated panel; author lookup
  falls back to `GET /users?ids=` for members beyond the cap (correct names, no role).
- A non-member reading a public room sees a list that refreshes on open and on focus
  only: live events only reach members (chat limitation L3).
- `GET /users?ids=` lets any authenticated user resolve a known ULID to a public
  summary; ULIDs are not guessable and the same data is public by identifier.
- An author who left shows their current profile, not the one they had when posting.
- Presence and the "hide offline members" filter, member-level actions in the card
  (direct message, invite, role change, remove, ban) and the panel in `dm` and
  `group_dm` rooms are left to later features.
- Tests that open a Radix popover or dropdown under jsdom are slow (`nwsapi` selector
  matching), so tests of components that merely use the popover swap it for
  `test/popover-mock.tsx`; the panel's sheet is exercised for real.
