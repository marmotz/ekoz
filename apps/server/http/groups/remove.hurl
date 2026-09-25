# Delete a group — happy path (web-client-mentions S4). Needs `room.manage_groups` on its node.
# Set `access_token`, `room_id` and `group_id` (throwaway group).
DELETE {{base_url}}/rooms/{{room_id}}/groups/{{group_id}}
Authorization: Bearer {{access_token}}
HTTP 204
