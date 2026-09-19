# Change a member's role — happy path (technical.md §9, issue #4). Needs
# `room.manage_roles`; the target role cannot exceed the caller's own
# effective authority. Set `access_token` to a privileged member's token,
# `room_id` and `target_user_id` (a current member).
PATCH {{base_url}}/rooms/{{room_id}}/members/{{target_user_id}}
Authorization: Bearer {{access_token}}
{
  "role": "moderator"
}
HTTP 200
[Asserts]
jsonpath "$.role" == "moderator"
