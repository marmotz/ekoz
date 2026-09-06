# server — conversations: messages, Markdown, mentions, replies, pins

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#30](https://github.com/ekoz-chat/server/issues/30)

Reference: [../features/conversations/technical.md §11](../features/conversations/technical.md#11-messages).

## To do

1. Prisma models: `Message`, `MessageMention`, `MessagePin`.
2. `POST /rooms/:id/messages { body, replyToId?, mentions? }` — needs `room.post`
   and not `readOnly`.
3. Restricted-Markdown validation: a `remark` pipeline with a node allowlist
   (emphasis, strong, strikethrough, inline/fenced code, blockquote, lists,
   `http(s)`/`mailto` links, breaks); reject anything else; store the source.
   `messages.body_max_length` cap.
4. Structured mentions: verify each `userId` is resolvable/a member, store
   `message_mention`, include in the event.
5. Replies: `replyToId` must be a message in the same room; redacted/hidden
   parent still anchors.
6. Pins: `PUT/DELETE /rooms/:id/pins/:messageId` (needs `room.pin`),
   `GET /rooms/:id/pins`.
7. Events: `message_created`, `pin_added`, `pin_removed`.

## Dependencies

- [25-conv-event-log-and-seq](25-conv-event-log-and-seq.md)
- [26-conv-permission-model](26-conv-permission-model.md)
