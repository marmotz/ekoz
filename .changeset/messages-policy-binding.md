---
"@ekozhq/sdk": minor
---

Add `messages.policy()` (public `GET /messages/policy`) and the `MessagesPolicy`
type and `MessagesPolicySchema`, so a client can enforce the server's maximum
message body length (issue #191).
