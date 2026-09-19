# Invite a user without room.invite (technical.md §9, issue #4) → 403
# "room.permission_denied". Set `access_token` to an unprivileged member's
# token, `room_id` and `target_user_id`.
POST {{base_url}}/rooms/{{room_id}}/invitations
Authorization: Bearer {{access_token}}
{
  "userId": "{{target_user_id}}"
}
HTTP 403
[Asserts]
jsonpath "$.code" == "room.permission_denied"
