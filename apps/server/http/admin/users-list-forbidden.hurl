# Account list as a non-owner (technical.md §2.1, issue #14) → 403
# "auth.forbidden". Set `access_token` to an ordinary (non-owner) account's
# token.
GET {{base_url}}/admin/users
Authorization: Bearer {{access_token}}
HTTP 403
[Asserts]
jsonpath "$.code" == "auth.forbidden"
