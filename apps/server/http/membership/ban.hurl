# Ban a user from a room — happy path (technical.md §9, issue #4). Needs
# `room.ban`; removes any existing membership too. Set `access_token` to a
# privileged member's token, `room_id` and `target_user_id`.
POST {{base_url}}/rooms/{{room_id}}/bans
Authorization: Bearer {{access_token}}
{
  "userId": "{{target_user_id}}",
  "reason": "testing"
}
HTTP 204
