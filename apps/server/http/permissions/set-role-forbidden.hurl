# Set a role override as a caller without room.manage_permissions
# (technical.md §6, issue #3) → 403 "room.permission_denied". Set
# `access_token` to an ordinary member's token and `room_id`.
PUT {{base_url}}/rooms/{{room_id}}/permissions
Authorization: Bearer {{access_token}}
{
  "role": "member",
  "capability": "room.pin",
  "effect": "allow"
}
HTTP 403
[Asserts]
jsonpath "$.code" == "room.permission_denied"
