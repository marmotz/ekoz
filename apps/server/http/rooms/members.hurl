# List a room's effective members — happy path (issue #67). Explicit members plus
# those of its ancestor spaces. Set `access_token` and `room_id` to a room the
# caller can read. Follow `nextCursor` with `?cursor=<nextCursor>`.
GET {{base_url}}/rooms/{{room_id}}/members?limit=100
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.items" isCollection
jsonpath "$.items[0].role" isString
jsonpath "$.items[0].user.id" isString
