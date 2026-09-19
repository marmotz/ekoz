# Move a room under a new parent — happy path (technical.md §5, issue #1).
# Needs `space.manage` on the moved room. Set `access_token` to an owner's
# token, `room_id` to the room being moved, and `parent_room_id` to its new
# parent space.
POST {{base_url}}/rooms/{{room_id}}/move
Authorization: Bearer {{access_token}}
{
  "parentId": "{{parent_room_id}}"
}
HTTP 200
[Asserts]
jsonpath "$.parentId" == "{{parent_room_id}}"
