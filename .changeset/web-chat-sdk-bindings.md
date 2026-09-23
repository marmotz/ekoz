---
"@ekozhq/sdk": minor
---

Add the web chat bindings: `client.messages` (`list`, `get`, `send`),
`client.sync.get`, `client.rooms.members` and `client.stream` (`RoomStream`: SSE
with a fresh single-use ticket on every reconnection, jittered backoff, resume
from the last `feedSeq`, `reconnected` signal). `ClientConfig` gains
`eventSource`. New hand-written `RoomEvent` discriminated union and
`SyncResponse`, plus wire types and schemas `Message`, `MessagesPage`, `Member`,
`MembersPage` and `StreamTicket` (issues #71 and #72).
