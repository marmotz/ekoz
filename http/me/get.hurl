# The authenticated account (technical.md §13, issue #19): account + profile +
# `{ isOwner, emailVerified, status }`. Set `access_token`.
GET {{base_url}}/me
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.identifier" == "owner/ekoz.localhost"
jsonpath "$.status" == "active"
jsonpath "$.isOwner" == true
