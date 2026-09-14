# Direct children of a room — happy path (issue #1). Set `access_token` and
# `room_id` to a space that has at least one child channel.
GET {{base_url}}/rooms/{{room_id}}/children
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$" isCollection
