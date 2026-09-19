# Move a room under one of its own descendants (technical.md §5, issue #1) →
# 422 "room.cycle". Set `access_token` to an owner's token, `room_id` to a
# space, and `parent_room_id` to one of `room_id`'s own children.
POST {{base_url}}/rooms/{{room_id}}/move
Authorization: Bearer {{access_token}}
{
  "parentId": "{{parent_room_id}}"
}
HTTP 422
[Asserts]
jsonpath "$.code" == "room.cycle"
