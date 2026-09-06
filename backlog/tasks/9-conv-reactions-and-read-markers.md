# server — conversations: reactions and read markers

**Status**: todo
**Type**: backend
**Issue**: [#9](https://github.com/marmotz/ekoz/issues/9)

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

- 7-conv-messages (done — `tasks/done/server-7-conv-messages.md`)
- 4-conv-membership (done — `tasks/done/server-4-conv-membership.md`)
