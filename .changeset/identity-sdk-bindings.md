---
"@ekozhq/sdk": minor
---

Add the identity bindings: `me.changePassword()`, `me.usernameState()`,
`me.cancelUsernameRequest()` and `users.avatar()` (returns a `Blob`, since the
avatar route needs a Bearer token). `HttpClient.request` gains
`responseType: 'json' | 'blob'`. New wire types: `ChangePasswordBody`,
`UsernameChangeState`, `UsernameChangePendingRequest` (issue #104).
