# A group that is not on or above the room → 404 "group.not_found".
# Set `access_token` and `room_id`; `group_id` must belong to an unrelated room.
GET {{base_url}}/rooms/{{room_id}}/groups/{{group_id}}
Authorization: Bearer {{access_token}}
HTTP 404
[Asserts]
jsonpath "$.code" == "group.not_found"
