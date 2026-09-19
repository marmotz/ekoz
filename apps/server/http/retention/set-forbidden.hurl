# Set the retention rule as a caller without room.manage_retention
# (technical.md §13, issue #12) → 403 "room.permission_denied". Set
# `access_token` to an ordinary member's token and `room_id`.
PUT {{base_url}}/rooms/{{room_id}}/retention
Authorization: Bearer {{access_token}}
{
  "mode": "hide",
  "after": "30d"
}
HTTP 403
[Asserts]
jsonpath "$.code" == "room.permission_denied"
