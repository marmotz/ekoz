---
"@ekozhq/sdk": patch
---

`admin.attachments.search()` items now carry `blobId` and `refCount`, so the
admin console can remove a blob everywhere and show how many places
reference it before confirming (issue #157). Export `AdminAttachmentItem`,
`AdminAttachmentsPage`, `AdminStorageDashboard`, `AdminStorageTopConsumer`,
`AdminUserStorageView` and `ConfigParameterView` from the package root —
their Zod schemas were already exported, but the wire types themselves were
missing, which the admin console needs to type the settings and storage
screens (issues #156, #157).
