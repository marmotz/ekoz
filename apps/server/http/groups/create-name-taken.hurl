# A name already used on the room chain → 409 "group.name_taken".
# Run `create.hurl` first, then this file with the same `room_id`.
POST {{base_url}}/rooms/{{room_id}}/groups
Authorization: Bearer {{access_token}}
{"name": "devs"}
HTTP 409
[Asserts]
jsonpath "$.code" == "group.name_taken"
