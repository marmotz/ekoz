# Rename a group — happy path (web-client-mentions S4). Needs `room.manage_groups` on its node.
# Set `access_token`, `room_id` and `group_id`.
PATCH {{base_url}}/rooms/{{room_id}}/groups/{{group_id}}
Authorization: Bearer {{access_token}}
{"name": "engineers"}
HTTP 200
[Asserts]
jsonpath "$.name" == "engineers"
