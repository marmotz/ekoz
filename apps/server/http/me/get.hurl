# The authenticated account (technical.md §13, issue #19): account + profile +
# `{ isOwner, emailVerified, status }` + `pendingEmail` (unverified email change,
# or null). Set `access_token`.
GET {{base_url}}/me
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.identifier" == "owner/ekoz.localhost"
jsonpath "$.status" == "active"
jsonpath "$.isOwner" == true
jsonpath "$.pendingEmail" exists
