# Add a member to a group — happy path (web-client-mentions S4). Idempotent.
# Needs `room.manage_groups` on its node. Set `access_token`, `room_id`, `group_id` and
# `target_user_id` (an effective member of the group's room).
PUT {{base_url}}/rooms/{{room_id}}/groups/{{group_id}}/members/{{target_user_id}}
Authorization: Bearer {{access_token}}
HTTP 204
