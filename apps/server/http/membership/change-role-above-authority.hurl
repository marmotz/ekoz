# Set a role above the caller's own effective authority (technical.md §9,
# issue #4) → 403 "room.role_above_authority". Set `access_token` to a
# `room_admin`'s token, `room_id` and `target_user_id` (a current member) —
# the body asks for `space_admin`, above a `room_admin`'s own rank.
PATCH {{base_url}}/rooms/{{room_id}}/members/{{target_user_id}}
Authorization: Bearer {{access_token}}
{
  "role": "space_admin"
}
HTTP 403
[Asserts]
jsonpath "$.code" == "room.role_above_authority"
