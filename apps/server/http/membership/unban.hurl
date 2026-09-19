# Unban a user from a room — happy path (technical.md §9, issue #4). Needs
# `room.ban`. Set `access_token` to a privileged member's token, `room_id`
# and `target_user_id` (from `ban.hurl`).
DELETE {{base_url}}/rooms/{{room_id}}/bans/{{target_user_id}}
Authorization: Bearer {{access_token}}
HTTP 204
