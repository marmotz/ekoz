# A group and its members — happy path (web-client-mentions S4). Needs `room.read`.
# Set `access_token`, `room_id` (the group's room or a descendant) and `group_id`.
GET {{base_url}}/rooms/{{room_id}}/groups/{{group_id}}
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.members" isCollection
jsonpath "$.memberCount" isInteger
