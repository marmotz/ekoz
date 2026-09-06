# server — conversations: reactions and read markers

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#32](https://github.com/ekoz-chat/server/issues/32)

Reference: [../features/conversations/technical.md §11, §14](../features/conversations/technical.md#14-read-markers).

## To do

1. Prisma models: `Reaction` (`@@id([messageId, userId, emoji])`), `ReadMarker`
   (`@@id([roomId, userId])`).
2. `PUT /messages/:mid/reactions/:emoji` / `DELETE …` — needs `room.react`;
   emit `reaction_added` / `reaction_removed`.
3. `PUT /rooms/:id/receipt { seq }` — monotonic (ignore lower), emit
   `receipt_updated { userId, seq }`.
4. `GET /rooms/:id/receipts` — every member's marker (participants only).

## Dependencies

- [30-conv-messages](30-conv-messages.md)
- [27-conv-membership](27-conv-membership.md)
