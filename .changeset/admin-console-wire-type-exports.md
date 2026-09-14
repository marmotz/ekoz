---
"@ekozhq/sdk": patch
---

Export `AdminUserDetail`, `AdminUserListItem`, `AdminUserListResponse` and
`SetupStateResponse` from the package root — their Zod schemas were already
exported, but the wire types themselves were missing, which the admin console
needs to type `admin.users.list()` / `.get()` and `setup.state()` results.
