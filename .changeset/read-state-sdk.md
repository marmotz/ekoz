---
"@ekozhq/sdk": minor
---

Add the read state bindings. New `client.receipts` (`set(roomId, seq)`, `list(roomId)`)
and the `ReadMarker` wire type, a typed `ReceiptUpdatedEvent` room event (`{ userId, seq }`),
and `RoomListItem.unreadCount` (capped at 100, `null` for `context` rooms)
(issues #218, #219, #220).
