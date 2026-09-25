# List the groups defined on a room and its ancestors — happy path (web-client-mentions S4).
# Needs `room.read`. Set `access_token` and `room_id`.
GET {{base_url}}/rooms/{{room_id}}/groups
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.items" isCollection
