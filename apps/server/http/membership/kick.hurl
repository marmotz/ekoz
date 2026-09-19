# Kick a member out of a room — happy path (technical.md §9, issue #4). Needs
# `room.kick`. Set `access_token` to a privileged member's token, `room_id`
# and `target_user_id` (a current member).
DELETE {{base_url}}/rooms/{{room_id}}/members/{{target_user_id}}
Authorization: Bearer {{access_token}}
HTTP 204
