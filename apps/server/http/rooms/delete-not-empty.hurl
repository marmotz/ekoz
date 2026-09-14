# Delete a room that still has children (technical.md §5, issue #1) → 409
# "room.not_empty". Set `access_token` to an owner's token and `room_id` to a
# space with at least one child channel.
DELETE {{base_url}}/rooms/{{room_id}}
Authorization: Bearer {{access_token}}
HTTP 409
[Asserts]
jsonpath "$.code" == "room.not_empty"
