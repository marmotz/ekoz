# Set this room's retention rule — happy path (technical.md §13, issue #12).
# Needs `room.manage_retention`. Set `access_token` to an owner's/admin's
# token and `room_id`.
PUT {{base_url}}/rooms/{{room_id}}/retention
Authorization: Bearer {{access_token}}
{
  "mode": "hide",
  "after": "30d"
}
HTTP 200
[Asserts]
jsonpath "$.rule.mode" == "hide"
jsonpath "$.rule.after" == 2592000
