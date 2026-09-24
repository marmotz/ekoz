---
"@ekozhq/sdk": minor
---

Add the rooms bindings the web client needs (issue #81): `client.rooms` gains
`list`, `get`, `preview`, `children`, `myPermissions`, `createSpace`,
`createChannel`, `join`, `leave`, `requestToJoin`, `listJoinRequests`,
`approveJoinRequest` and `rejectJoinRequest`; new `client.roomInvitations`
(`listMine`, `accept`, `decline`) and `client.directory` (`list`). Their wire
types (`Room`, `RoomListItem`, `RoomPreview`, `MyRoomInvitation`,
`PendingJoinRequest`, `UserSummary`, `Membership`, `JoinRequest`, ...) and Zod
schemas are exported from the package root.
