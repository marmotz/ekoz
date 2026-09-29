# Web client message actions: technical design

**Status**: technical design. Follows the decisions in [overview.md](./overview.md).
No code is changed by this document.

## 1. Scope

Acting on a message from the chat view of `apps/client-web`: reply, react, edit,
delete, pin and unpin, plus the live display of reactions and pins. The protocol
has to grow for two reads (reactions on a message, message content in the pins
list) and one limit (the edit window, added to the messages policy).

| Workspace         | Work                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/server`     | `reactions` on `Message`, `message` on each pin, `editWindow` on `GET /messages/policy`, two guards on redacted messages (S1 to S4). |
| `docs/`           | Protocol pages and changelog, OpenAPI, one technical page.                                             |
| `packages/sdk`    | `messages.edit / delete / pin / unpin / pins / react / unreact`, typed reaction and pin events, changeset. |
| `apps/client-web` | Timeline reactions, context menu, reaction picker and chips, reply, inline edit, delete dialog, pinned panel. |

Out of scope: editing attachments
([`content-and-sharing`](../content-and-sharing/overview.md)); mention chips and
mention editing
([`web-client-mentions`](../web-client-mentions/technical.md)); the formatting
toolbar
([`web-client-composer-formatting`](../web-client-composer-formatting/overview.md));
moderation reasons and logs
([`web-client-room-moderation`](../../../features/web-client-room-moderation/overview.md)).

Related:
- [messages and interactions protocol](../../../../docs/protocol/messages-and-interactions.md);
- [rooms and permissions protocol](../../../../docs/protocol/rooms-and-permissions.md);
- [web client chat](../../../../docs/technical/web-client-chat.md);
- [web client composer editor](../../../../docs/technical/web-client-composer-editor.md);
- [OpenAPI description and SDK types](../../../../docs/technical/openapi-description-and-sdk-types.md).

## 2. Verified findings

| #   | Finding | Evidence | Consequence |
| --- | ------- | -------- | ----------- |
| F1  | `Message` carries no reactions and no endpoint lists them. Reactions are one row per `(messageId, userId, emoji)` with `createdAt`, indexed on `messageId`. | [message.view.ts:6](../../../../apps/server/src/modules/conversations/messages/message.view.ts), [contract.prisma:634](../../../../apps/server/src/core/prisma/contract.prisma) | `reactions` is added to `MessageView` (S1). |
| F2  | The message views are built in four places (`send`, `edit`, `list`, `get`), all through `toMessageView(row, mentions)`. Mentions are loaded by a batched query for a page. | [messages.service.ts:101](../../../../apps/server/src/modules/conversations/messages/messages.service.ts), [:140](../../../../apps/server/src/modules/conversations/messages/messages.service.ts), [:245](../../../../apps/server/src/modules/conversations/messages/messages.service.ts), [:260](../../../../apps/server/src/modules/conversations/messages/messages.service.ts), [message.view.ts:36](../../../../apps/server/src/modules/conversations/messages/message.view.ts) | Same batched pattern for reactions. The mentions design also changes `toMessageView`, so both must stay additive (§7). |
| F3  | `GET /rooms/:id/pins` returns `{ roomId, messageId, pinnedById, pinnedAt }[]` with no message content, unpaginated, newest first. | [messages.service.ts:321](../../../../apps/server/src/modules/conversations/messages/messages.service.ts), [pin.view.ts:4](../../../../apps/server/src/modules/conversations/messages/pin.view.ts) | Each pin embeds its `Message` (S2). |
| F4  | `pin` looks the message up with `findMessageOrThrow`, which does not check `redactedAt`. `ReactionsService.add` resolves only the room id. Both accept a redacted message, although `redactMessage` deletes pins and reactions. | [messages.service.ts:263](../../../../apps/server/src/modules/conversations/messages/messages.service.ts), [reactions.service.ts:72](../../../../apps/server/src/modules/conversations/reactions/reactions.service.ts) | A late pin or reaction would resurrect state on a tombstone. Both answer `message.not_found` (S3). |
| F5  | Deleting a message removes its pins, mentions and reactions in the same transaction and emits only `message_deleted`. No `pin_removed` or `reaction_removed` follows. | [messages.service.ts:180](../../../../apps/server/src/modules/conversations/messages/messages.service.ts) | The client clears reactions and drops the pin itself on `message_deleted` / `message_redacted`. |
| F6  | `messages.edit_window` is a hot-reloadable runtime setting in seconds (`null` = unlimited), enforced by the server. It is not exposed to any client. [`web-client-composer-formatting`](../web-client-composer-formatting/technical.md) plans a public `GET /messages/policy` (`{ bodyMaxLength }`, #190, SDK #191), built to grow additively. | [registry.ts:413](../../../../apps/server/src/core/config/registry.ts), [messages.service.ts:405](../../../../apps/server/src/modules/conversations/messages/messages.service.ts), [composer-formatting technical.md S1](../web-client-composer-formatting/technical.md) | The window is a second field of that policy (S4). |
| F7  | `TimelineMessage` mirrors `Message`. `applyRoomEvent` ignores every event but the four `message_*` ones (default branch only advances `lastSeq`). A `message_edited` triggers a refetch of the message. Events at or below `lastSeq` are dropped. | [timeline.ts:13](../../../../apps/client-web/src/features/chat/lib/timeline.ts), [:156](../../../../apps/client-web/src/features/chat/lib/timeline.ts), [use-timeline-sync.ts:31](../../../../apps/client-web/src/features/chat/hooks/use-timeline-sync.ts) | Reaction events are applied in the pure timeline; the edit refetch must not overwrite reactions (C1). |
| F8  | The page is at least as recent as its `lastSeq`, and clients apply events with `seq > lastSeq`. A reaction present in the page may therefore be replayed by an event. | [messages-and-interactions.md](../../../../docs/protocol/messages-and-interactions.md) (`GET /rooms/:id/messages`) | Reaction events are applied with set semantics (idempotent) (C1). |
| F9  | The SDK `messages` resource has `list`, `get`, `send` only. `SendMessageBody` already has `replyToId`. Nothing calls pins, reactions, edit or delete. `RoomEvent` types only four message events; `reaction_*` and `pin_*` fall in `UnknownRoomEvent`. | [messages.ts:24](../../../../packages/sdk/src/resources/messages.ts), [events.ts:44](../../../../packages/sdk/src/types/events.ts) | New bindings and typed events (§5). |
| F10 | `MessageItem` renders a message and `Composer` sends `{ body }` only; `useSendMessage` never sends `replyToId`. `MessageList` has no scroll-to-message. | [message-item.tsx:44](../../../../apps/client-web/src/features/chat/components/message-item.tsx), [use-send-message.ts:60](../../../../apps/client-web/src/features/chat/hooks/use-send-message.ts), [message-list.tsx](../../../../apps/client-web/src/features/chat/components/message-list.tsx) | Reply, jump and highlight are new (C4). |
| F11 | Client dependencies: `@radix-ui/react-dropdown-menu` and `-dialog` are installed; no context menu, popover or tooltip; `sonner` is installed and `toast` exported. `useMe()` returns `id`. | [package.json](../../../../apps/client-web/package.json), [sonner.tsx](../../../../apps/client-web/src/shared/ui/sonner.tsx), MeView `id` in the generated SDK types | Add `context-menu` (this feature); `popover` and `tooltip` are shared with [members](../web-client-members/technical.md) and composer formatting, the first feature to land adds them. |
| F12 | Client features never import one another (ESLint `boundaries`). Routes compose features. `RoomHeader` has no slot for another feature's control; [members](../web-client-members/technical.md) adds an `actions` slot. | [eslint.config.js](../../../../apps/client-web/eslint.config.js), [$roomId.tsx](../../../../apps/client-web/src/routes/_app/rooms/$roomId.tsx), [room-header.tsx:30](../../../../apps/client-web/src/features/rooms/components/room-header.tsx) | Everything acting on messages stays in `features/chat`; the route places the pinned-panel toggle in the header slot. |
| F13 | Mentions plan the jump mechanism this feature needs: `GET /rooms/:id/messages` with `around` / `after` (#169), a `?at=<seq>` route search param, a detached timeline and scroll-into-view (#179), and `messages.edit` with `mentions?` in the SDK (#175). | [mentions technical.md §3 S6, §5 C5](../web-client-mentions/technical.md) | Reused, not duplicated (§7). |

## 3. Decisions

| Topic | Retained | Alternatives | Why |
| ----- | -------- | ------------ | --- |
| Reactions on the wire | `Message.reactions: { emoji, userIds }[]`, in order of first reaction. Count is `userIds.length`, "mine" is derived by the client. | `{ emoji, count, me, userIds capped }` | A per-viewer `me` cannot ride on shared room events (same limit as `mentionsMe` in the mentions design). Full lists keep the nominal hover exact. |
| Reaction events | Unchanged payloads `{ messageId, emoji }`, actor in `senderId`, applied by the client with set semantics. | Sending the whole reaction list in the event | Payloads are already fixed in the protocol; set semantics makes replays safe (F8). |
| Pins content | Each pin embeds `message: Message`. | One `GET` per pin | One request, no N+1. Deleted messages are already gone (F5). |
| Pin indicator | Derived from the pins query, not a field on `Message`. | `pinned` on every message | Pins are room state with their own events; the panel needs the list anyway. |
| Edit window | `editWindow` (seconds or `null`) on the public `GET /messages/policy` of composer formatting. | `messageEditWindow` on `my-permissions`; the discovery document; its own endpoint | It is a server-wide setting, like `bodyMaxLength`; the policy endpoint is read on every call (hot reload) and is not cached like the discovery document, which mixes federation data. Repeating a global value on every room permission response would be wrong. |
| Reply quote data | Client resolves the parent from the loaded timeline, else `messages.get`. | Embedding `replyTo: { author, excerpt }` in `Message` | No protocol change and always as fresh as the parent. Costs one request per unloaded parent, cached. |
| Jump | Reuses `around` and `?at=` from the mentions design. | Paging back until found; loaded messages only | Product decision; the parent `seq` comes from `messages.get`. |
| Menu | Radix context menu (right click, long press) and the existing dropdown for the "..." button, both fed by one pure list of actions. | Custom press handling | Radix handles touch long press and keyboard; one list keeps both surfaces identical. |
| Emoji picker | `emoji-picker-react` (MIT, peer `react >=16.8`), in its reactions mode (quick row plus "+" to expand to the full picker with search), in a popover. | `@emoji-mart/react` (peer `react` up to 18, not React 19); `frimousse` (0.4.0, unstyled) | Covers "quick emojis plus full picker" in one component, with search, theme and localised data. |
| Edit UI | Inline, on top of the composer component of mentions and formatting. | A textarea now, swapped later | Avoids throwaway work; the edit task is ordered after the TipTap composer (§7). |
| Delete | Confirm dialog (existing `dialog`), local tombstone on success, stream confirms. | Optimistic tombstone before the answer | A refused delete must not flash a tombstone. |
| Unchanged edit | Saving an identical body cancels without a request. | Always sending | The server would set a spurious `editedAt`. |
| Pins panel | A `Sheet` from the right, opened from a header toggle. | An inline column | The members panel already owns the right column; two persistent panels would compete. |

## 4. Server changes (`apps/server`, `conversations` module)

### S1. Reactions on `Message`

- `MessageViewSchema` gains `reactions: z.array(z.object({ emoji: z.string(), userIds: z.array(z.string()) }))`
  ([message.view.ts:6](../../../../apps/server/src/modules/conversations/messages/message.view.ts)).
  `toMessageView(row, mentions, reactions)`.
- `MessagesService.reactionsForMany(messageIds)`, next to `mentionsForMany`
  ([messages.service.ts:391](../../../../apps/server/src/modules/conversations/messages/messages.service.ts)):
  one `Reaction` query on `messageId in (...)`, ordered by `createdAt` then
  `userId`, grouped by emoji in order of first appearance. Used by `listMessages`
  and `listPins`; `getMessage` and `editMessage` use the single-id form; `sendMessage`
  returns `[]`.
- A redacted message returns `[]` (its rows are already deleted).
- `message_created` is unchanged: a new message has no reactions.

### S2. Pins embed the message

- `MessagePinViewSchema` gains `message: MessageViewSchema`
  ([pin.view.ts:4](../../../../apps/server/src/modules/conversations/messages/pin.view.ts)).
  `PUT /rooms/:id/pins/:messageId` returns it too.
- `listPins` loads the pinned messages in one query, with mentions and reactions
  through the batched helpers, keeps the `pinnedAt desc` order.
- Hidden messages (`hiddenAt` set) are returned like the history does; the client
  filters them.
- The list stays unpaginated. Consequence: a room with thousands of pins returns
  thousands of messages; acceptable for the demonstration server, to revisit with a
  cursor if a real deployment needs it.

### S3. Guards on redacted messages

- `pin`: a redacted message answers `message.not_found` (`404`).
- `ReactionsService.add`: `roomIdForMessage` also reads `redactedAt`; a redacted
  message answers `message.not_found` (`404`)
  ([reactions.service.ts:72](../../../../apps/server/src/modules/conversations/reactions/reactions.service.ts)).
- Protocol page: add the error to both endpoints.

### S4. `editWindow` on the messages policy

- [`web-client-composer-formatting`](../web-client-composer-formatting/technical.md)
  adds `GET /messages/policy` returning `{ bodyMaxLength }` (#190). This feature adds
  `editWindow: number | null` to it, in seconds, the value of `messages.edit_window`
  read on every call. If #190 has not landed, this task creates the endpoint with both
  fields and #190 adds `bodyMaxLength`; either order is additive.
- The server stays the arbiter: `assertCanEditOrThrow` is unchanged.

### S5. Documentation and OpenAPI

- [messages-and-interactions.md](../../../../docs/protocol/messages-and-interactions.md):
  `reactions` on the `Message` object, the embedded `message` on pins, the new
  `404` cases, and the note that deleting a message emits no `pin_removed` or
  `reaction_removed`.
- The "Policy" section of [messages-and-interactions.md](../../../../docs/protocol/messages-and-interactions.md):
  the `editWindow` field of the messages policy.
- [CHANGELOG.md](../../../../docs/protocol/CHANGELOG.md) entry; `apps/server/openapi.json`
  regenerated.

## 5. SDK (`packages/sdk`)

- `MessagesResource` gains (paths in F9):
  - `edit(roomId, messageId, { body })` (`PATCH`). If the mentions design has
    already added `edit` with `mentions?`, this task reuses it.
  - `delete(roomId, messageId)`.
  - `pin(roomId, messageId)`, `unpin(roomId, messageId)`, `pins(roomId)`.
  - `react(messageId, emoji)` and `unreact(messageId, emoji)`, the emoji passed
    through `encodeURIComponent`; the routes are not room-scoped.
- `types/wire.ts`: alias the generated pin view (`MessagePin`); `Message` and
  `MessagesPolicy` pick the new fields after regeneration.
- `types/events.ts`: typed `ReactionAddedEvent`, `ReactionRemovedEvent`,
  `PinAddedEvent`, `PinRemovedEvent`, removed from `OtherRoomEventType`.
- A changeset (`bunx changeset`) for `@ekozhq/sdk`.

## 6. Web client (`apps/client-web`, `features/chat`)

### C1. Timeline state (`lib/timeline.ts`)

- `TimelineMessage` gains `reactions: { emoji: string; userIds: string[] }[]`;
  `toTimelineMessage` copies it; `message_created` starts with `[]`.
- `applyRoomEvent` handles `reaction_added` and `reaction_removed` for a loaded
  message:
  - add: append the actor to the emoji entry, creating it at the end if absent;
    nothing if the actor is already there;
  - remove: drop the actor, and the entry when it empties; nothing if absent.

  This is idempotent, which covers F8.
- `toTombstone` clears `reactions`, so `message_deleted` and `message_redacted`
  drop them (F5).
- `replaceMessage` keeps the reactions of the message already in the timeline and
  takes everything else from the fetched one. Reactions are driven by events; an
  edit refetch that raced a reaction event must not roll it back.
- Local helpers `toggleReactionLocally(timeline, messageId, emoji, userId, on)` and
  `redactLocally(timeline, messageId, at)` reuse the same code paths; they back the
  optimistic reaction and the local tombstone after a delete.

### C2. Which actions to offer (`lib/message-actions.ts`)

A pure function `availableActions({ message, myId, capabilities, editWindow, now, canPost })`
returns the set of `reply`, `react`, `edit`, `delete`, `pin`, `unpin`.

- Nothing for a redacted or hidden message, or a pending one.
- `reply`: the composer is not blocked (`composerBlock(...) === null`,
  [composer-state.ts](../../../../apps/client-web/src/features/chat/lib/composer-state.ts)).
- `react`: `room.react`.
- `edit`: own message with `room.edit_own` and inside `editWindow`
  (`createdAt + editWindow >= now`, or no window), or `room.edit_any`.
- `delete`: own message with `room.delete_own`, or `room.delete_any`.
- `pin` / `unpin`: `room.pin`, chosen by whether the message is in the pins query.
- No available action: no menu and no "..." button.

The window comes from `useMessagesPolicy()` (`hooks/use-messages-policy.ts`, created by
composer formatting on `sdk.messages.policy()`; created here if this feature lands first).
While the policy is loading or failed, "Edit" on an own message is offered as if there
were no window and the server decides. The window is compared against the client clock; a skew only
shows or hides "Edit" a little early or late, and the server decides.

### C3. Menu, picker and reaction chips

- `shared/ui/context-menu.tsx`: shadcn wrapper over the new
  `@radix-ui/react-context-menu` dependency.
- `MessageMenu` wraps a message row in the context menu and adds a "..." button that
  opens the existing dropdown menu; both render the same items from C2, so the two
  surfaces cannot diverge.
- The "React" item opens a popover anchored to the row with `emoji-picker-react` in
  reactions mode. Its exact props are to be checked against the installed version at
  implementation:
  - the quick set (`reactions`) is a fixed short list defined in the feature;
  - the emoji character is read from the click payload and sent to `messages.react`;
  - native emoji rendering, so no third-party image host is contacted;
  - language: the picker's localised data for the active i18n language, theme from the
    app theme.
- `ReactionBar` under the message body: one chip per entry, showing emoji and
  `userIds.length`, highlighted when `userIds` includes `useMe().data.id`.
  - Click toggles my reaction, only with `room.react`; otherwise the chip is display
    only.
  - The toggle is optimistic through `toggleReactionLocally`, then `PUT` / `DELETE`.
    `409 message.reaction_already_exists` and `404 message.reaction_not_found` are
    treated as success; any other error reverts the change and shows a `toast`.
  - Hover and focus open a tooltip listing the reactors' names through `useAuthors`
    (a reactor who left shows the usual "Unknown user" until
    [members](../web-client-members/technical.md) lands `useUserSummaries`).
- The emoji picker module is loaded lazily, so the chat bundle does not carry it.

### C4. Replies

- `RoomChat` holds `replyTarget: TimelineMessage | null`, set by the "Reply" item and
  cleared on send, on cancel or on room change.
- `Composer` gets a banner above the editor: "Replying to <author>" with the parent
  excerpt and a cancel button. It is a separate component placed above the editor, so
  it does not depend on the composer rebuild of the mentions design.
- `useSendMessage.send(body, replyToId?)` passes `replyToId` to `sdk.messages.send`.
  `PendingMessage` gains `replyToId` so a pending or retried reply already shows its
  quote. `message.reply_not_in_room` and other errors follow the existing failure
  mapping.
- `ReplyQuote` above the body of a message with `replyToId`:
  - parent taken from the timeline when loaded, else `useQuery` on a new key
    `chatKeys.message(roomId, id)` calling `sdk.messages.get`;
  - shows the parent author and a compact rendering of its body (`MessageBody` gets a
    `compact` prop: links flattened to text, two lines clamped);
  - a parent with `redactedAt` reads "Message deleted"; a failed fetch reads
    "Message unavailable";
  - `useTimelineSync` invalidates `chatKeys.message(...)` on `message_edited` and
    `message_deleted` for that id.
- Click on the quote:
  - parent in the attached, loaded timeline: scroll to it and highlight it;
  - otherwise `messages.get` for its `seq`, then navigate to `?at=<seq>` (F13), where
    the detached timeline scrolls to and highlights it.
- `MessageList` gains `scrollToMessage(id)` and a transient highlight class, also
  used by the pinned panel and by the `?at=` jump of the mentions design.

### C5. Inline edit

- `RoomChat` holds `editingId`; only one message is edited at a time. Starting another
  edit or opening a reply closes the current one, discarding its draft after the same
  dirty check.
- `MessageItem` swaps the body for `MessageEditor`: the composer component of the
  mentions and formatting designs, initialised from the message body (its mention
  parsing included), with Enter to save and Escape to cancel.
- Save:
  - body unchanged: cancel, no request;
  - empty body: save disabled (the server requires a body; deleting is the way to
    remove a message);
  - otherwise `sdk.messages.edit`, then `replaceMessage` with the response (which keeps
    the local reactions, C1). The `message_edited` echo refetches the same state.
- Errors keep the editor open with an inline message: `room.permission_denied` (window
  elapsed or right removed), `message.body_too_long`, `message.body_invalid`,
  `message.not_found` (deleted meanwhile, which also closes the editor), network. The
  code mapping extends `REASON_BY_CODE` in
  [use-send-message.ts:16](../../../../apps/client-web/src/features/chat/hooks/use-send-message.ts).
- A remote edit of the message being edited does not touch the draft (last write
  wins); a remote deletion closes the editor with a notice.
- The "(edited)" label and its hover date already exist
  ([message-item.tsx:60](../../../../apps/client-web/src/features/chat/components/message-item.tsx));
  only the hover date is added.

### C6. Delete

- A confirmation `Dialog` naming the action, with the message excerpt, Cancel and
  Delete.
- On success `redactLocally` turns the message into a tombstone (idempotent with the
  `message_deleted` echo). On error the dialog stays open with the reason
  (`room.permission_denied`, `message.not_found`, network).
- Deleting a pinned message: the pins query drops the entry on `message_deleted` /
  `message_redacted`, since no `pin_removed` follows (F5).

### C7. Pins

- `usePins(roomId)`: query `chatKeys.pins(roomId)` on `sdk.messages.pins`, fetched
  when the room opens and kept current by `useTimelineSync`:
  - `pin_added` and `pin_removed`: invalidate (a new pin needs its embedded message);
  - `message_deleted` / `message_redacted`: remove the entry locally.
- A pin indicator on a message whose id is in the query. Pin and unpin items call
  `messages.pin` / `messages.unpin`; `409 message.already_pinned` and
  `404 message.not_pinned` are treated as success.
- `PinsToggle` and `PinsPanel`, both exported from `features/chat`:
  - the toggle (icon with count) is placed by the route in the `RoomHeader` `actions`
    slot (F12);
  - the panel is a `Sheet` listing pins newest first: author, time, compact body,
    pinner; hidden messages filtered out;
  - clicking an entry closes the sheet and uses the same jump as C4.
- The pins query is only enabled for a member who can read; a `403` shows nothing.

### C8. i18n and files

- Strings under `chat.actions.*`, `chat.reactions.*`, `chat.reply.*`, `chat.edit.*`,
  `chat.delete.*`, `chat.pins.*` in both `common.json` catalogues.
- Files stay in `features/chat` (F12): `components/message-menu.tsx`,
  `reaction-bar.tsx`, `reaction-picker.tsx`, `reply-quote.tsx`, `reply-banner.tsx`,
  `message-editor.tsx`, `delete-message-dialog.tsx`, `pins-panel.tsx`,
  `pins-toggle.tsx`; `hooks/use-message-actions.ts`, `use-pins.ts`;
  `lib/message-actions.ts`.
- New dependencies: `@radix-ui/react-context-menu`, `emoji-picker-react`; plus
  `@radix-ui/react-popover` and `@radix-ui/react-tooltip` if no earlier feature has
  added them.

## 7. Dependencies and order

- [`web-client-mentions`](../web-client-mentions/technical.md):
  - #169 (`around` / `after`), #175 (SDK) and #179 (`?at=` jump, detached timeline) are
    prerequisites of the jump in C4 and C7 only.
  - #177 (TipTap composer) is a prerequisite of C5. Mentions extends `messages.edit`
    with `mentions?`; whichever lands first defines it, the other extends it, as that
    design already states.
  - Both designs edit `toMessageView` and `TimelineMessage`; S1 and C1 are additive
    fields, so they merge without conflict.
- [`web-client-composer-formatting`](../web-client-composer-formatting/technical.md):
  the inline editor picks up its toolbar when it lands. #190 (`GET /messages/policy`)
  and #191 (SDK binding) are shared with S4 and C2 (see S4 for the either-order rule).
- [`web-client-members`](../web-client-members/technical.md): the header `actions` slot
  (C7), `useUserSummaries` for reactors who left, and the popover primitive.
- Independent of everything else: S1 to S5, the SDK, C1 to C3, the reply without jump,
  delete, and pin and unpin without jump.

## 8. Tests

- **Server, e2e** (`conversations-messages.e2e-spec.ts`,
  `conversations-reactions-receipts.e2e-spec.ts`):
  - `reactions` on list, get, send and edit; grouping and order; empty after a delete;
  - pins list embeds messages, order kept, redacted message gone;
  - pin and react on a redacted message answer `404`;
  - `GET /messages/policy` returns `editWindow` for a set and an unset window.
- **SDK:** resource tests for the new bindings (paths, encoded emoji, bodies);
  `events.test.ts` for the four typed events.
- **Client, unit** (`timeline.test.ts`, a new `message-actions.test.ts`):
  - reaction add and remove, idempotent replay, tombstone clearing, `replaceMessage`
    keeping reactions;
  - `availableActions` per capability, own or other, inside and outside the window,
    blocked composer, pending, redacted.
- **Client, components** (`room-chat.test.tsx` and new files):
  - context menu and "..." offer the same items; hidden when empty;
  - reaction chips: own highlight, toggle, 409 as success, revert on error, tooltip
    names;
  - picker selection calls `react`;
  - reply banner, quote for a loaded, unloaded, deleted and failing parent, jump;
  - inline edit: save, unchanged cancel, empty disabled, error kept open, remote
    deletion closes it;
  - delete dialog: confirm, cancel, error;
  - pins: toggle count, panel order, jump, `message_deleted` drops an entry.

## Implementation task breakdown

GitHub issues in `marmotz/ekoz`, label `feature:web-client-message-actions`, in dependency order.

| Issue | Task | Depends on |
| ----- | ---- | ---------- |
| [#207](https://github.com/marmotz/ekoz/issues/207) | Server: `reactions` on `Message` and guards on redacted messages (S1, S3) | none |
| [#208](https://github.com/marmotz/ekoz/issues/208) | Server: `editWindow` on the messages policy (S4) | none (soft link with #190) |
| [#209](https://github.com/marmotz/ekoz/issues/209) | Server: pins embed the message (S2) | #207 |
| [#210](https://github.com/marmotz/ekoz/issues/210) | SDK: edit, delete, pins, reactions and typed events (section 5) | #207, #208, #209 |
| [#211](https://github.com/marmotz/ekoz/issues/211) | Client: action availability, context menu and delete (C2, C3 menu, C6) | #210, #191, #208 |
| [#212](https://github.com/marmotz/ekoz/issues/212) | Client: reactions state, chips and emoji picker (C1, C3) | #210, #211 |
| [#213](https://github.com/marmotz/ekoz/issues/213) | Client: reply banner and quote (C4) | #210, #211 |
| [#214](https://github.com/marmotz/ekoz/issues/214) | Client: pins query, indicator and panel (C7) | #209, #210, #211, #127 |
| [#215](https://github.com/marmotz/ekoz/issues/215) | Client: jump to the parent of a reply and to a pinned message (C4, C7) | #213, #214, #179 |
| [#216](https://github.com/marmotz/ekoz/issues/216) | Client: inline message edit (C5) | #210, #211, #177 |
| [#217](https://github.com/marmotz/ekoz/issues/217) | Docs: `docs/technical/web-client-message-actions.md` | #211 to #216 |
