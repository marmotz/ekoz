# Create a group on a room — happy path (web-client-mentions S4). Needs `room.manage_groups`.
# Set `access_token` and `room_id`. `memberIds` must be effective members of the room.
POST {{base_url}}/rooms/{{room_id}}/groups
Authorization: Bearer {{access_token}}
{"name": "devs"}
HTTP 201
[Asserts]
jsonpath "$.name" == "devs"
jsonpath "$.inherited" == false
