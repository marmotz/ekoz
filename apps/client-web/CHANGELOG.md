# Changelog

Format [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versioning
[SemVer](https://semver.org/).

## [Unreleased]

### Added

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
