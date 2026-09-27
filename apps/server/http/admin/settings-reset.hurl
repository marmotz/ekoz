# Revert a runtime override to its file / default value (technical.md §2,
# issue #145). Run after settings-set.hurl. Set `access_token` to an owner.
DELETE {{base_url}}/admin/settings/messages.max_page
Authorization: Bearer {{access_token}}
HTTP 204
