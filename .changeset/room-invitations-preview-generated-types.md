---
"@ekozhq/sdk": patch
---

Regenerate the API types from the server contract: the room invitation list
(`GET /me/room-invitations`, with the shared `UserSummary` shape) and the invite
room preview (`GET /rooms/:id/preview`) shapes are now available (issues #63,
#64).
