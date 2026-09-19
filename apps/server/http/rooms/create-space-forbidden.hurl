# Create a root space as a non-owner (technical.md §4, issue #1) → 403
# "room.permission_denied". Set `access_token` to an ordinary account's token.
POST {{base_url}}/spaces
Authorization: Bearer {{access_token}}
{
  "name": "Not allowed"
}
HTTP 403
[Asserts]
jsonpath "$.code" == "room.permission_denied"
