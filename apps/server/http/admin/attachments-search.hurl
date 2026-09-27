# Search attachments across every room (technical.md §S11, issue #146). Set
# `access_token` to an owner.
GET {{base_url}}/admin/attachments?limit=20
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.items" isCollection
jsonpath "$.nextCursor" exists
