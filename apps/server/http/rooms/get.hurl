# Room detail — happy path (issue #1). Set `access_token` and `room_id` (from
# `create-space.hurl` or `create-channel.hurl`).
GET {{base_url}}/rooms/{{room_id}}
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{room_id}}"
