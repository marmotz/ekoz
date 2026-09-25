---
"@ekozhq/sdk": minor
---

Add the mentions and groups bindings. `messages.send()` takes structured mention
targets (`MentionInput`: `user`, `all`, `role`, `group`), `messages.edit()` is new
and can replace them, and `messages.list()` accepts `after` and `around`.
`Message.mentions` and `message_created` events now carry `MentionTarget[]`
(`{ type, target, token }`) instead of user ids, and messages report `mentionsMe`
(breaking). New `client.mentions` (`list()`, `unread()`) and `client.groups`
(`list`, `get`, `create`, `rename`, `remove`, `addMember`, `removeMember`), the
`GroupChangedEvent` room event, and their wire types and schemas
(issues #168, #169, #173, #174, #175).
