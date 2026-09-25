# Web client mentions

## Context

Mentions were typed as `@text` in a `<textarea>` and never sent: `mentions` was always
empty and the timeline showed the raw text. The `web-client-mentions` scope makes them
real end to end: a composer that picks people, groups, roles and `@all`, chips in
rendered messages, a highlight for messages that concern the caller, room groups,
unread mention counters and a "My mentions" page that opens a room at the mentioned
message.

The server, protocol and SDK side (targets versus audience, frozen tokens, groups,
counters, `after` / `around` history) is recorded in [Mentions](mentions.md). This page
records what shipped in `apps/client-web`. The feature-level design is in
[`backlog/features/web-client-mentions/technical.md`](../../backlog/features/web-client-mentions/technical.md).
It builds on [web client chat](web-client-chat.md),
[web client composer editor](web-client-composer-editor.md) (TipTap 3) and
[web client members](web-client-members.md).

## Decision

### Where the code lives

Features never import each other, and three of the pieces are used by more than one
feature, so they sit in `shared/`:

```
src/shared/messages/    message-body, markdown-allow-list, remark-mentions,
                        mention-tokens, mention-chip, mention-style
src/shared/groups/      room-groups (useRoomGroups), use-groups-live
src/shared/mentions/    mentions-me, unread-mentions, use-unread-mentions-live
src/features/chat/      composer (TipTap), mention-node, mention-suggestions,
                        mention-doc, use-mention-suggestions, timeline (detached)
src/features/rooms/     room-groups (settings), mention-badge, group mutations
src/features/mentions/  sidebar-mentions, my-mentions-list, use-my-mentions
src/routes/_app/        mentions.tsx, rooms/$roomId/groups.tsx, rooms/$roomId.tsx (`at`)
```

`MessageBody` moved from `features/chat` because "My mentions" renders bodies too. It
takes the room id along with the message's `mentions`, since a chip resolves members
and groups in the room the message belongs to.

### Composer

`composer.tsx` is rebuilt on TipTap, as decided in
[web client composer editor](web-client-composer-editor.md).

- **Schema.** `StarterKit` with heading, horizontal rule and underline switched off
  (link kept, no autolink), `@tiptap/markdown`, and the mention node. The body is
  `editor.getMarkdown()`, trimmed; a blank body is never sent.
- **Keys.** Enter sends, Shift+Enter inserts a line break, composition (IME) is
  respected. The handler is an editor prop, so it runs before the suggestion plugin;
  it steps aside while the popup is open, where Enter picks the highlighted entry.
- **Server rendering.** The editor is created on the client only
  (`immediatelyRender: false`); until then a disabled `Textarea` stands in.
- **Contract.** `onSend({ body, mentions })`, `mentions` being the de-duplicated
  `{ type, target, token }` of the mention nodes. `useSendMessage` maps them to the
  API inputs (`{ type: 'user', userId }`, `{ type: 'role', role }`, ...) and keeps them
  on the pending entry, so the pending message shows its chips and a retry resends
  the same targets.
- **Mention node** (`lib/mention-node.ts`). It extends `@tiptap/extension-mention`, an
  atomic inline node with `{ type, target, token, label }`, drawn as a chip
  `@label` and serialised to Markdown as its `token`. The token is computed like the
  server does: `@identifier`, `@all`, `@<role>`, `@<groupName>`. Mention's own
  `[@ id=...]` Markdown syntax is switched off, so a body never round-trips through it.
- **Suggestion** (`hooks/use-mention-suggestions.tsx`, `lib/mention-suggestions.ts`).
  Members from `useRoomMembers`, groups from `useRoomGroups`, the five roles and
  `@all`; groups, roles and `@all` only in channels (`room.type === 'channel'`, so a
  DM offers people only). The filter is case-insensitive on display name, identifier and
  name, capped per section. The popup is a React listbox rendered by the composer
  (so it has the app providers), positioned from the caret rectangle; arrows move,
  Enter or Tab pick, Esc closes, and `aria-activedescendant` on the editor follows the
  option. Opening the popup refetches the groups when they are older than their
  30 s staleness window.
- **Edit round trip** (`lib/mention-doc.ts`). `injectMentionNodes` walks a parsed body
  and turns every occurrence of one of the message's tokens back into a mention node,
  code excluded, with the same matching rule as the chips. The message edit UI of
  `web-client-message-actions` is not built yet; it calls
  `injectMentionNodes(editor.markdown.parse(body), mentions, labelFor)` and sends the
  full `mentions` list with `messages.edit`.
- **Failure.** `message.mention_not_member` and `message.mention_invalid` both map to
  `mention_invalid` ("A mention is no longer valid").

### Chips and highlight

`remark-mentions` splits `text` nodes (never `inlineCode` or `code`) on the exact
tokens of the message's `mentions`. The shared matcher `splitOnTokens` tries the
longest token first and requires the next character not to be in `[a-z0-9_.-/]`, so
`@al` never matches inside `@alice` (and `@all.` at the end of a sentence does not
match either). Each match becomes a `mention` node, allowed in `ALLOWED_ELEMENTS` and
rendered by `MentionChip`. The composer's edit round trip uses the same matcher.

| Kind | Chip |
|------|------|
| `user`, member | `@displayName`, opens `ProfileCardPopover` |
| `user`, left the room | `@displayName 🚪` (from `useUserSummaries`) |
| `user`, deleted account | raw token, 💀, not clickable |
| `all`, `role` | localised label (`chat.mentions.*`) |
| `group` | current name from `useRoomGroups`; a deleted group shows the raw token, muted |

Each kind has its own colour and icon (`mention-style.ts`, shared with the composer
chip). A message with `mentionsMe` set is tinted: strongly for `direct`, lightly for
`collective`.

### Live "concerns me"

A live `message_created` carries no per-viewer value (the shared event log cannot), so
`deriveMentionsMe` derives it from the targets: `user` equal to me is `direct`; `all`,
my effective role, or a group I belong to is `collective`; the author never concerns
themselves. Receiving the event means I am an effective member now, which is send
time. The viewer is read from the query cache **at event time** (`['me']`, the members
of the room for my role, the groups for `isMember`), and `useTimelineSync` keeps those
queries loaded. REST pages carry the server value, which replaces the derived one on
the next load; `message_edited` already refetches the message.

The role comes from the members list, not from `RoomGate`: the gate only hands
capabilities, not the caller's role.

### Room groups settings

`features/rooms/components/room-groups.tsx` lists the groups defined on the node,
inherited ones read-only with the room they come from, and creates, renames, deletes
(after a confirmation dialog) and edits members through a picker on `useRoomMembers`.
It is gated on `room.manage_groups`, validates names client-side with the server rules
(`^[a-z0-9_.-]{1,32}$`, not `all` or a role name), and maps `group.name_reserved`,
`group.name_taken`, `group.member_not_member` and `group.not_found`. Every write
invalidates `['groups', roomId]`, failed or not.

Until `web-client-room-settings` mounts it in a "Groups" tab, it is served at
`/rooms/$roomId/groups` under the room's gate and header, with a header link shown with
`room.manage_groups`, like `/rooms/$roomId/requests`. `useGroupsLive`, mounted by the
room route, invalidates the groups on a `group_changed` of that node; descendants of a
changed space catch up through the 30 s staleness.

### Jump to a message and detached timeline

`/rooms/$roomId` accepts `?at=<seq>`. `validateRoomSearch` keeps a decimal string (or
the number a hand-typed URL gives) and overrides anything else with `undefined`, since
the router merges a validator's result over the raw search. `RoomChat` is keyed by the
room and `at`, so a new target remounts it and loads the new window.

With `at`, the first page is `messages.list(roomId, { around: at })` and the timeline is
**detached** (`hasMoreNewer`): a window that does not end at the newest message.

- `applyRoomEvent` does not insert a `message_created` while detached (it would leave a
  gap); edits and deletions still apply to loaded messages. A confirmed own message is
  dropped from the pending list without being inserted, and shows once the window has
  caught up.
- Scrolling to the bottom, or the "Load newer messages" button, loads `after` pages
  through `appendNewer` until `hasMoreNewer` is false; the timeline then behaves as one
  opened on the newest page.
- A "Jump to latest" bar, shown only while detached, drops `at` from the URL, which
  remounts the chat on the newest page.
- `MessageList` scrolls the target to the centre once and outlines it for 2.5 s
  (`data-jump-target`). A target that is not there (deleted, out of retention) shows an
  info toast and leaves the loaded window as is.

### Unread counters and "My mentions"

`shared/mentions` owns `['mentions', 'unread']` (`useUnreadMentions`, on
`client.mentions.unread()`) and the prefix `['mentions', 'list']`.
`useUnreadMentionsLive`, mounted once in the `_app` layout inside `RequireAuth`,
invalidates both, coalesced to one refetch per second (leading edge, then one trailing
run), on:

- a `message_created` whose derived `mentionsMe` is set, outside the open room. A room
  that was never opened has no cached role or groups, so a `role` or `group` target
  counts as possibly concerning the caller and the refetch settles it;
- the caller's own `receipt_updated`;
- a `message_edited`, `message_deleted` or `message_redacted` in a room that has unread
  mentions.

`MentionBadge` sits in the room tree row next to the name: filled with the total when
`direct > 0`, outlined for collective mentions only, with an accessible label.
`features/mentions` registers a sidebar section (`order` 5, before the rooms tree) with
the total, and `/mentions` lists `client.mentions.list` as an infinite list: room,
author (through `useUserSummaries`), time, the rendered body, a direct / collective
marker and an unread marker. Opening an item goes to `/rooms/$roomId?at=<seq>`.

### Query keys

| Key | Owner |
|-----|-------|
| `['groups', roomId]`, `['groups', roomId, 'detail', groupId]` | `shared/groups`, `features/rooms` |
| `['mentions', 'unread']` | `shared/mentions` |
| `['mentions', 'list']` | `features/mentions` |
| `['chat', 'timeline', roomId]` | `features/chat` (now possibly detached) |

## Alternatives

| Topic | Chosen | Rejected | Why |
|-------|--------|----------|-----|
| Live `mentionsMe` | Derived in the client from the targets and cached members / groups | A per-viewer field on the event | The shared event log and the per-user feed copies carry the same payload; REST pages carry the server value and replace it. |
| Where chips resolve data | The chip reads the members and groups queries of the message's room | The renderer receives resolved names | Names change (rename, leave); the queries are already shared and live. |
| Suggestion popup | React listbox rendered by the composer | `ReactRenderer` and a floating library | No new dependency, and the popup gets the app providers (i18n, query client). |
| Detached timeline | `around` page, `hasMoreNewer`, `after` pages, live inserts paused | Loading everything up to the head; inserting live messages across the gap | A gap in the middle of a timeline breaks the `seq` ordering the reducer relies on. |
| Coalescing | Leading edge plus one trailing run per second | A debounce | A debounce would delay the first badge under a steady flow of mentions. |
| Jump target outline | A data attribute set on the element | Component state | No render needed for a 2.5 s effect. |

## Consequences

- **L1. Counters never decrease for now.** The SDK has no read-marker call and the
  client sets none, so unread counts only grow until
  [`web-client-read-state`](../../backlog/features/web-client-read-state/overview.md)
  ships the marker. The server side additionally needs read markers for inherited
  members (an inherited space member has none, see [Mentions](mentions.md)).
- **L2. Derived value until reload.** A live message's `mentionsMe` is derived, so it can
  differ from the server value (for example a group membership that changed between
  send and receive); the next REST load corrects it.
- **L3.** `mentions` of an edited message are only sent by an edit UI that does not
  exist yet; the helper for it is in place and tested.
- **L4.** The suggestion query cannot contain a space (the TipTap default), so people
  are found by the first word of their name or by identifier.
- **L5.** The room tree shows no session-only "unseen" dot in the code today
  (`useRoomHasUnseen` is exported by `shared/realtime` but not read there), so the
  badge stands alone in the row.
- `@tiptap/markdown` parses and serialises Markdown; the restricted-Markdown subset
  is enforced by the schema, and the server still validates the body.
