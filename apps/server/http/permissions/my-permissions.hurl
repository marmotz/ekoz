# The caller's effective capability set on a room — happy path (technical.md
# §6, issue #3). Set `access_token` and `room_id`.
GET {{base_url}}/rooms/{{room_id}}/my-permissions
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.capabilities" isCollection
