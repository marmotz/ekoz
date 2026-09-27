# Changelog

Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning
[SemVer](https://semver.org/).

## [Unreleased]

### Added

- Regenerate the API types: `GET /me/storage` and `POST /files/urls` response shapes, and the problem-details `details` field (#136, #137, #138, #139, #140, #141).
- Add direct and group conversations: a "Direct messages" section in the sidebar listing them with an unseen dot, and a conversation page with its header, history and composer (#183).
- Delete a one-to-one conversation from its header, after a confirmation; it comes back with the next message and none of the earlier ones (#183).
- Redirect the link of a direct or group conversation opened as a room to its conversation page (#183).
- Refresh the conversations list from the stream, and leave the open conversation with a toast when it is deleted or the user is removed from it (#183).
- A new group conversation shows in every member's list as soon as it is created (#183).
- Add a new conversation page with a debounced people search, chips, an exact `name/server` lookup, and a start button for one person or a create group button for several (#184).
- Add a message icon to the profile card that opens the one-to-one conversation with the person (#184).
- Export a `StartConversationButton` that opens the one-to-one conversation with a user (#184).
- Add group settings: participants with an admin badge, rename, add members with or without the past messages, remove a member, promote or demote an admin, and leave, warning the only admin that the group will be deleted (#185).
- Document the direct messages client in `docs/technical/web-client-direct-messages.md` (#185).
- Regenerate the API types: conversations and contacts endpoints, group management and the profile `id` (#166, #171, #172).
- Send the presence heartbeat with the stream, marking the user idle after 60 s hidden or 5 min without input, and add an "Appear away" / "Appear online" entry to the user menu (#133).
- Make the user appear away as soon as they sign out (#133).
- Show a presence dot on message authors, the members panel, the profile card and the own avatar in the user menu, fed by the stream and cleared on reconnection (#133, #135).
- Show the presence of the partner of a direct conversation in the rooms tree and the room header (#135).
- Show who is typing above the composer and animated dots on the rooms tree where someone types (#134).
- Let the user menu take entries that render themselves besides links (#133).
- Document the presence and typing design in `docs/technical/presence-and-typing.md` (#130).
- Regenerate the API types: the heartbeat response carries the manual away flag and the timing settings, and `PUT /presence/preference` is available (#131).

- Add several members to a group at once with a multiple-selection combobox: typing filters the room members and each pick becomes a chip in the field.
- Make the sections of the members panel (roles, groups) collapsible, kept open while searching.
- Add a "By group" view to the members panel listing each user group with its members, a member of several groups appearing in each.
- Add a context menu and a "..." button on messages listing the actions the caller can take, and a confirmed delete that leaves a tombstone (#211).
- Show reactions under messages as chips with their reactors on hover, toggle them, and pick an emoji from a quick row or the full picker, live from the stream (#212).
- Add replying to a message, with a banner above the composer and the quoted parent above the reply (#213).
- Add pinning and unpinning messages, a pin indicator, a pinned messages panel opened from the room header, and the latest pin shown under the header (#214).
- Add jumping from a reply quote or a pinned message to the message it points to (#215).
- Edit a message inline in the composer editor, with the edit date shown on hover of the "(edited)" label (#216).
- Document the message actions client in `docs/technical/web-client-message-actions.md` (#217).
- Regenerate the API types: messages carry reactions, pins embed their message and the messages policy has the edit window (#207, #208, #209).
- Show fenced code blocks highlighted in messages, with a language label, auto-detection without a declared language and a copy button (#192).
- Add a formatting toolbar to the composer (bold, italic, strikethrough, code, quote, lists, link) with shortcuts in tooltips, a help panel and an "Aa" toggle on narrow screens, and make Enter send in lists and code blocks with Shift+Enter as the new line (#193).
- Add a link popover to the composer, opened by the toolbar or Ctrl/Cmd+K, that only accepts `http`, `https` and `mailto` links and linkifies pasted and typed URLs (#194).
- Add a language selector on composer code blocks (#195).
- Show a length counter in the composer near the server limit and block sending beyond it (#196).
- Document the composer formatting in `docs/technical/web-client-composer-formatting.md` (#197).
- Show "Read by everyone" instead of the avatar list once every other member has read a message.
- Show unread state on the mobile menu button: a grey badge with the total of unread messages and a dark one with the unread mentions.
- Send the read marker while a room is read (list at the bottom, window visible and focused), replacing the unseen-rooms store with the active and reading room (#221, #222).
- Add unread message badges in the rooms tree (with the sum on a collapsed space) and keep the rooms list and invitations live from the stream, dropping the timer-and-focus refetch override (#223).
- Draw read receipts under messages: up to five avatars and `+N` of the members whose marker sits on each message (#224).
- Document the read state client in `docs/technical/web-client-read-state.md` (#225).
- Focus the message composer by default when a room is opened.
- Add the mentions UI: chips for user, role, `@all` and group mentions in messages (member, left, deleted and deleted-group states), a highlight for messages that concern the caller, the shared `shared/messages` renderer and `shared/groups` query, and a live derivation of `mentionsMe` for incoming messages (#176).
- Rebuild the composer on TipTap with `@` suggestions (people, groups, roles, `@all` in channels), send the mentioned targets, map `message.mention_not_member` and `message.mention_invalid` to a failure, and add the helper that turns a body back into mention nodes for editing (#177).
- Add the room groups settings at `/rooms/$roomId/groups`, reachable from the room header with `room.manage_groups` (#178).
- Add jump to a message: the `at` search param of a room, a detached timeline that loads newer pages up to the newest message, a "Jump to latest" bar and a brief outline of the target (#179).
- Add unread mention badges in the rooms tree, live counters, and the "My mentions" page with a sidebar entry (#180).
- Document the mentions client in `docs/technical/web-client-mentions.md` (#181).
- Regenerate the API types from the server contract: `unreadCount` on room list items (#219).
- Regenerate the API types from the server contract: structured message mention targets, `mentionsMe`, `hasMoreNewer`, room groups and mention counters, and type the timeline mentions accordingly (#173, #175).
- Tint the sidebar and members panel with a dedicated `surface-panel` surface (light and dark) so they stand out from the chat.
- Scaffold the web client on TanStack Start (Vite, Tailwind CSS 4, strict TypeScript, `@/*` alias), with a placeholder home route and Vitest + Testing Library setup.
- Add the `eslint-plugin-boundaries` module-boundary check (`lint:boundaries`): features may only import `shared` and themselves; guarded by a fixture-based test.
- Add shadcn/ui base components (`button`, `dropdown-menu`, `sheet`, `avatar`, `sonner`, `skeleton`) and the `cn()` helper under `src/shared`.
- Add TanStack Query integration: a query client per request, no retry on authentication or 4xx errors, unhandled `AuthenticationError` signal, SSR dehydration/hydration and dev tools.
- Add the light / dark / system theme (`ThemeProvider`, `ThemeToggle`, anti-flash inline script).
- Add react-i18next (French + English) with a per-request instance, `Accept-Language` detection on the server, a `LanguageSwitcher` and typed translation keys.
- Wire the SDK client and the session: `localStorage` session store, `SdkProvider`, `useSession()`, `RequireAuth` and sign-out on a lost session (#34).
- Add the application shell: responsive sidebar fed by a navigation registry, top bar with page title, language switcher and theme toggle, and `/` and `/login` placeholder routes (#35).
- Check in CI that a change under `src/` comes with a changelog entry (#36).
- Regenerate the API types from the server contract: message page and effective member list shapes (#66, #67).
- Regenerate the API types from the server contract: room list, pending join request list and room creation shapes (#79, #80, #81).
- Add a sidebar section registry, rendered under the navigation in the fixed sidebar and the mobile sheet, and a `useMe()` hook over `GET /me` (#65).
- Add the `_app` and `_auth` route layouts: every page inside the application shell lives under `routes/_app/`, anonymous pages get a centered card without sidebar (`AuthLayout`), plus `GuestOnly`, shadcn/ui `input`, `label` and `card`, and `auth` and `me` stubs in the SDK test double (#92).
- Add the signed-in user menu in the top bar: display name with initials, and sign out (#93).
- Add the generated TanStack Form hooks (`@kurotako/gen-react-tanstack`, `src/generated`) for the authentication request bodies, a `PasswordInput`, form field wrappers and the server error code table with its `useAuthError` hook (#94).
- Add the `/check-email` screen, the resend verification form and `useAuthPolicy()` (#95).
- Add the sign-in page at `/login` (#96).
- Add the registration page at `/register` for the `open`, `invite` and `admin` registration modes (#97).
- Add the email verification page at `/verify-email` (#98).
- Add the `/forgot-password` and `/reset-password` pages (#99).
- Add shared profile pieces: a user menu entry registry (`registerUserMenuItem`) rendered by the user menu, `useAvatarSrc` and `UserAvatar` (avatar fetched through the SDK and shown as an object URL), shadcn/ui `textarea` and `dialog`, `sessions` and `users` stubs in the SDK test double, generated forms for the account request bodies, and the account error table (#105).
- Move `PasswordInput` and the form field wrappers (`FormTextField`, `FormError`) from `features/auth` to `shared/ui`, and the validation message mapping to `shared/i18n` (#105).
- Add the `/account` page with the profile and avatar sections (#106).
- Add the identifier (with its change policy, cooldown and pending request), email (with pending verification and resend) and password sections to `/account` (#107).
- Add the sessions list (rename, revoke, sign out other sessions) and the account deletion dialog to `/account` (#108).
- Add `shared/realtime`: `RealtimeProvider` opens the SDK stream while the session is authenticated, generic subscription hooks (`useConnectionStatus`, `useRoomEvents`, `useAccountEvents`, `useReconnected`) and the session-only unseen-rooms store, plus `messages`, `rooms`, `sync` and `stream` stubs in the SDK test double (#73).
- Add the chat timeline building blocks under `features/chat`: the pure timeline reducer (`applyRoomEvent`, `prependOlder`, `mergeFirstPage`, pending helpers), the Markdown allow-list (`react-markdown` + `remark-gfm`, no raw HTML, `http`/`https`/`mailto` links only) and the timeline and members queries (#74).
- Add the room history view: `RoomChat` with paginated history and scroll-up loading, author labels (deleted account, unknown user), deleted and edited markers, an error state with retry, and the `chat.*` i18n keys (#75). The `/rooms/$roomId` route composes `RoomGate` around `RoomChat`; the `RoomGate` is a placeholder (writable room, caller is a member) until `web-client-rooms` delivers the real one.
- Add live chat sync: stream events applied to the timeline, edit refetch, deletion tombstones, buffering while the first page loads, `/sync` catch-up after a reconnection with a first-page reload fallback, the active-room handling and the connection banner (#76).
- Add the message composer with optimistic send, failed-send retry with mapped error reasons, and the disabled states for non-members, read-only rooms and missing permission (#77).
- Add the rooms data layer under `features/rooms`: query keys, query option factories over the SDK (the rooms list and invitations refetch on focus with a 10 s stale time, the directory and join requests page on `nextCursor`), the query hooks, the mutation hooks with their invalidations, the room error table (`rooms.errors.*`), and `rooms`, `roomInvitations` and `directory` stubs in the SDK test double (#82).
- Add the rooms sidebar section: `buildRoomTree`, `RoomTree` and `SidebarRooms` (context headers, room links, collapsible spaces persisted under `ekoz.rooms.collapsed`, New / Directory / Invitations entries with a pending badge), the `/rooms` layout route that registers it and the `/rooms` welcome page (#83).
- Replace the placeholder `RoomGate` with the real one: access resolved from the cached rooms list, then `GET /rooms/:id`, then the preview (`member`, `invited` with an Accept / Decline banner, `joinable` with a Join banner, `request` with the join request state, `unavailable`), children rendered with `{ room, capabilities, membership }` in the readable states only; add `RoomHeader` (name, topic, type, Leave for an explicit membership, the channels of a space) and compose both in `/rooms/$roomId`. The room queries take an `enabled` option, and declining an invitation also refreshes the room (#85).
- Add the `/rooms/new` page: `CreateRoomForm` creates a space or a channel under the spaces where the caller holds `space.create_child` (owners may create a root space), maps the parent error codes to the parent field and `422` issues to their fields, then opens the new room (#86).
- Add the `/rooms/directory` page: `DirectoryList` searches public channels (debounced 300 ms), pages on `nextCursor`, opens the rooms the caller already reads and joins the others (#87).
- Add the `/rooms/$roomId/requests` page: `JoinRequestList` shows the pending join requests (requester, date, deleted account label), approves or rejects them, pages on `nextCursor` and is guarded on `room.manage_members`, as is the "Requests" link of `RoomHeader` (#88).
- Add the `/rooms/invitations` page: `InvitationList` shows the pending room invitations (room name and type, inviter with the deleted account label, role, date), accepts them (then opens the room) or declines them, and refreshes the list with the mapped message when an invitation was answered elsewhere (#84).
- Share the room members query across features (`shared/members`: pages of 200 up to 2,000 members, `truncated` flag, refreshed live on every membership event) and resolve authors who left a room through `GET /users?ids=` instead of "Unknown user" (#125).
- Add the public profile card (`shared/profile`, shadcn/ui `popover`), opened from message authors and from a "My public profile" user menu entry, with left-the-room and deleted account markers (#126).
- Add the members panel: header toggle with the count, list grouped by role or A to Z with search, an inline column from `lg` and a sheet below, its state kept in `localStorage` (#127).
- Draw default avatars (no uploaded picture) as initials on a color derived from the account id, with dark or light text chosen for contrast.

### Changed

- Replace the door and skull emoji next to authors and mentions who left the room or deleted their account with a text note, and show a deleted account mention as "@Deleted account" instead of its handle, which a new account may reuse.

### Fixed

- Stop the console from logging "No queryFn was passed" for every reply quote: the timeline lookup now declares itself cache-only.
- Stop the page from scrolling when the members panel of a room with many members is open: the hover action buttons of the member rows escaped the list scroll area.
- Scale the initials of a default avatar with its size instead of a fixed font size.

