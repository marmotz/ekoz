# A public profile by identifier (technical.md §13, issue #19). Auth required.
# `:identifier` is a bare `name`. Set `access_token`.
GET {{base_url}}/users/owner
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.identifier" == "owner/ekoz.localhost"
jsonpath "$.displayName" isString
