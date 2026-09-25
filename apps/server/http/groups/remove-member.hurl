# Remove a member from a group — happy path (web-client-mentions S4). Idempotent.
# Needs `room.manage_groups` on its node. Set `access_token`, `room_id`, `group_id`, `target_user_id`.
DELETE {{base_url}}/rooms/{{room_id}}/groups/{{group_id}}/members/{{target_user_id}}
Authorization: Bearer {{access_token}}
HTTP 204
