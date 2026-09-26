# Web client message actions

## Context

The chat view showed messages and nothing else: a message could not be answered, reacted to,
edited, deleted or pinned from the web client, although the server, the protocol and (since
the SDK bindings) `@ekozhq/sdk` already carried those operations. The `web-client-message-actions`
scope adds them to `apps/client-web`, with the live display of reactions and pins.

The server and SDK side (reactions on the `Message` object, pins that embed their message, the
`editWindow` of the messages policy, the guards on redacted messages, the typed events) is
described in [messages and interactions](../protocol/messages-and-interactions.md) and in the
[design of the feature](../../backlog/_archives/features/web-client-message-actions/technical.md), which
holds the findings from the code and is not repeated here. This page records what shipped in
`apps/client-web`. It builds on [web client chat](web-client-chat.md),
[web client composer editor](web-client-composer-editor.md),
[web client composer formatting](web-client-composer-formatting.md) and
[web client mentions](web-client-mentions.md).

## Decision

### Reactions: the wire and the timeline (`features/chat/lib/timeline.ts`)

- `Message.reactions` is a list of `{ emoji, userIds }` in order of first reaction. The count is
  `userIds.length` and "mine" is derived from `useMe()`: a per-viewer flag cannot ride on
  events shared by the whole room.
- `reaction_added` and `reaction_removed` keep their `{ messageId, emoji }` payload with the
  actor in `senderId`. The timeline applies them with **set semantics**: adding an actor already
  present, or removing one that is absent, changes nothing (the state object is kept, so nothing
  re-renders). A page is at least as recent as its `lastSeq`, so a reaction it already contains
  can be replayed by an event.
- Deleting a message emits no `reaction_removed` (nor `pin_removed`): the tombstone clears the
  reactions, and a reaction event never targets a tombstone.
- `replaceMessage` (the refetch after a `message_edited`, and the response of an edit) keeps the
  reactions of the message already in the timeline. Reactions are driven by events; a fetch that
  raced one must not roll it back.
- The chips are optimistic: `toggleReactionLocally` applies the caller's change through the same
  code path as the stream event, then `messages.react` / `unreact` runs. `409
  message.reaction_already_exists` and `404 message.reaction_not_found` mean the server already
  holds the wanted state and count as success; any other error reverts the change and shows a
  toast.

### One list of actions, two surfaces (`lib/message-actions.ts`, `message-menu.tsx`)

`availableActions` is a pure function of the message, the caller, their capabilities, the edit
window and the composer state. It returns the actions in menu order: `reply` (composer not
blocked), `react` (`room.react`), `edit` (own message with `room.edit_own` inside the window, or
`room.edit_any`), `pin` or `unpin` (`room.pin`, chosen by the pins query), `delete` (own with
`room.delete_own`, or `room.delete_any`). A redacted or hidden message has none, and with no
action there is no menu and no "..." button.

`MessageMenu` renders that one list twice: a Radix context menu on the row (right click, long
press, keyboard) and a "..." button opening the existing dropdown. Feeding both from one list is
what keeps them identical. The server stays the arbiter of every rule: the client only hides what
would be refused. The edit window comes from `useMessagesPolicy()` (`editWindow`, in seconds,
`null` for none); while the policy loads or fails the window is treated as unlimited, and the
comparison uses the client clock, refreshed every 30 seconds while a window exists, so a clock
skew only shows or hides "Edit" a little early or late.

`RoomChat` provides the row-level state through `MessageActionsContext` (the caller, the
capabilities, the pinned ids, the message being edited and the handlers). Outside a chat there
is no context and a row shows no action, which keeps `MessageItem` usable on its own.

### Emoji picker (`reaction-picker.tsx`, `reaction-emoji-picker.tsx`)

`emoji-picker-react` in its reactions mode (a quick row and a "+" that expands to the full picker
with search), in a popover anchored to the message row and loaded lazily the first time it opens,
so the chat bundle does not carry it. Native emoji rendering, so no third-party image host is
contacted; the picker's localised data is loaded for the active language (French here, English is
built in) and its theme follows the `dark` class of the root element. Both the quick row and the
full picker report the emoji character, which is what `messages.react` sends.

### Replies (`reply-banner.tsx`, `reply-quote.tsx`)

- `RoomChat` holds the reply target, set by "Reply" and cleared on send or cancel. The banner is a
  component of its own above the composer, so it does not depend on the composer implementation.
- `useSendMessage.send(body, replyToId)` sends `replyToId`; `PendingMessage` carries it so a
  pending or retried reply already shows its quote.
- **Quote resolution.** The quote takes the parent from the loaded timeline, read reactively
  without fetching, and otherwise fetches it once with `messages.get` under
  `chatKeys.message(roomId, id)`. Embedding the author and an excerpt in `Message` was rejected: it
  is a protocol change, it would be stale when the parent is edited, and the fetch is one cached
  request per unloaded parent. `useTimelineSync` invalidates that key on `message_edited` and
  `message_deleted`. A deleted parent reads "Message deleted" and a failed fetch "Message
  unavailable"; neither is a link.
- `MessageBody` gets a `compact` mode (links and code blocks flattened to text, two lines clamped)
  shared by the quote, the banner, the delete dialog and the pins panel.

### Jumping to a message

The jump reuses the mechanism of [web client mentions](web-client-mentions.md), not a new one:
`?at=<seq>` opens the room on a window `around` that message (a detached timeline), and the list
scrolls to it and outlines it. Paging back until the message is found was rejected.

- `MessageList` exposes `scrollToMessage(id)` (scroll and the same transient outline the `at` jump
  uses); `RoomChat` exposes `jumpToMessage(id, seq?)`.
- A message already in the loaded timeline is scrolled to in place. Otherwise the `seq` is used, as
  known by the caller (a pin embeds its message) or fetched with `messages.get`, and the route
  navigates to `?at=<seq>`.
- Features cannot import one another, so the route composes: it holds the pins panel state, passes
  `onJumpToSeq` to `RoomChat` and calls `jumpToMessage` when a pins entry is chosen.

### Pins (`use-pins.ts`, `pins-toggle.tsx`, `pins-panel.tsx`)

- `GET /rooms/:id/pins` embeds each message, so the panel needs no other request. The pin indicator
  is derived from the pins query rather than a field on `Message`: pins are room state with their
  own events, and the panel needs the list anyway.
- `usePins` is enabled for readers only and a refusal shows nothing. Events keep it current
  through `useTimelineSync`: `pin_added` and `pin_removed` invalidate the query (a new pin needs its
  embedded message), and a deletion removes the entry locally, by id or, for `message_redacted`
  which carries only a `seq`, by the embedded message. Live events only reach the cache while a
  chat is mounted, so every mount refetches.
- Pin and unpin treat `409 message.already_pinned` and `404 message.not_pinned` as success.
- The panel is a `Sheet` from the right, newest first, hidden and deleted messages filtered out. An
  inline column was rejected: the members panel already owns the right column and two persistent
  panels would compete. The toggle is placed by the route in the `RoomHeader` `actions` slot.

### Inline edit (`message-edit-form.tsx`, `message-editor.tsx`)

- The edit is built on the shared TipTap editor (`MessageEditor`), not a throwaway textarea: it
  gets the formatting toolbar, the Enter rules, the length counter and the mention chips of the
  send composer. `MessageEditor` learned to load a message (`initial`: the body parsed back and the
  mention tokens turned into nodes again), to cancel on Escape and to report whether the draft
  changed.
- Saving an unchanged draft closes the editor without a request (the server would set a spurious
  `editedAt`); the baseline is the Markdown the editor holds right after loading, so a round trip
  that normalises the source (`*a*` to `_a_`) is not seen as a change. An empty body cannot be
  saved: deleting is how a message is removed.
- `RoomChat` holds one `editingId`. Starting another edit or a reply while the draft changed asks
  for confirmation first; Cancel and Escape leave at once.
- Errors keep the editor open with an inline reason (`room.permission_denied`,
  `message.body_too_long`, `message.body_invalid`, mention errors, network); `message.not_found`
  closes it. A remote edit of the message being edited does not touch the draft (last write
  wins); a remote deletion closes the editor with a notice.
- The "(edited)" label carries the edit date as its hover title.

### Delete (`delete-message-dialog.tsx`)

A confirmation dialog with the message excerpt. On success the message becomes a local tombstone
(`redactLocally`, idempotent with the `message_deleted` echo) and its pin is dropped; on error the
dialog stays open with the reason. An optimistic tombstone before the answer was rejected: a
refused delete must not flash a tombstone.

## Alternatives

- **`@emoji-mart/react`** peers on React up to 18 and **`frimousse`** is unstyled and pre-1.0;
  `emoji-picker-react` covers the quick row, the full picker, search, theme and localised data in
  one component.
- **Custom press handling** for the context menu: Radix already handles the touch long press and
  the keyboard.
- **Repeating `editWindow` on `my-permissions`** or the discovery document: it is a server-wide
  setting, read on every call of the messages policy, which is not cached like discovery.
- **A `me` flag per reaction** in `Message`: it cannot ride on shared room events.

## Consequences

- Reactions and pins are exact on a live room, and a replayed or raced event cannot corrupt them.
- The picker and its emoji data are a lazy chunk: the chat itself does not pay for them until a
  reaction is opened.
- The pins list is unpaginated (the server returns every pin with its message): a room with
  thousands of pins returns thousands of messages, acceptable for a demonstration server and to
  revisit with a cursor if it is not.
- The edit window is only as accurate as the client clock; a skew changes when "Edit" shows, never
  what the server accepts.
- A reactor who left the room reads as "Deleted account" in the tooltip until the summaries lookup
  resolves them, like message authors.
