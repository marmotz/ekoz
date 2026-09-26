# Web client message actions

**Status**: done, see [technical.md](./technical.md)

## Context

The server supports editing and deleting a message, replies (`replyToId`),
reactions and pins, see
[messages and interactions](../../../docs/protocol/messages-and-interactions.md).
[`web-client-chat`](../../_archives/features/web-client-chat/overview.md) only reflects remote edits
and deletions read-only; the UI offers no action on a message.

The protocol can write reactions but not read them: `Message` carries no
reactions and no endpoint lists them. This feature closes that gap.

## Goal

A user can act on a message from the chat view: edit or delete their own, reply
to one, react with an emoji, pin or unpin one where allowed, and see these
interactions from others live.

## Decisions made

### Access

- Actions live in a **contextual menu** only (right click, long press on touch,
  or a "..." button); no hover toolbar, no always-visible icons.
- An action is offered only if the user holds the permission (own message or
  the "any" variant for moderators, edit window included). A server refusal
  (permission changed, window expired) shows a clear error.

### Editing

- Edited **inline** in the timeline, with the same formatting composer as
  sending. Enter saves, Escape cancels.
- An edited message shows a discreet "(edited)" label; the edit date appears on
  hover.

### Deleting

- Asks for confirmation, then the message stays in place as a "Message deleted"
  tombstone (matches the protocol and the current rendering).

### Replies

- A reply shows a quote of the parent (author + beginning) above the message.
  Clicking it jumps to the parent, loading older history if it is not in the
  loaded page. A deleted parent reads "Message deleted".
- Replying shows a "Replying to ..." banner in the composer, with a cancel.

### Reactions

- The menu offers a few quick emojis plus a full picker with search.
- Reactions appear under the message as emoji chips with a count. Clicking a
  chip adds or removes the user's own reaction; the user's own chips are
  highlighted; hovering lists who reacted.
- Live updates from other users are reflected as they arrive.

### Pins

- Pin or unpin from the menu, shown only with the pin permission. A pinned
  message carries a pin indicator.
- A button in the room header opens the pinned list; clicking an entry jumps to
  the message in the timeline.

### Protocol extension

- The protocol is extended so messages carry their reactions (emoji, count,
  reactors) in history and sync. The server and SDK work is part of this
  feature, not a separate one.

## Dependencies

- [`web-client-chat`](../../_archives/features/web-client-chat/overview.md): timeline, live events.
- [`web-client-composer-formatting`](../web-client-composer-formatting/overview.md):
  the edit UI uses the same formatting composer (toolbar, shortcuts).
- Consumed by [`web-client-mentions`](../web-client-mentions/overview.md): editing
  can add or remove mentions.

## Feature order

- [Content and sharing](../content-and-sharing/overview.md) builds on the edit
  UI to add and remove attachments on a message.
