# A non-owner is refused (technical.md §2, issue #145). Set `access_token`
# to a non-owner account.
GET {{base_url}}/admin/settings
Authorization: Bearer {{access_token}}
HTTP 403
[Asserts]
jsonpath "$.code" == "auth.forbidden"
