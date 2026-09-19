# Create a channel attached to a space — happy path (technical.md §4, §7,
# issue #1). Needs `space.create_child` on the parent. Set `access_token` to an
# owner's token and `room_id` to a space id (from `create-space.hurl`).
POST {{base_url}}/rooms
Authorization: Bearer {{access_token}}
{
  "parentId": "{{room_id}}",
  "name": "general",
  "visibility": "public"
}
HTTP 201
[Asserts]
jsonpath "$.type" == "channel"
jsonpath "$.parentId" == "{{room_id}}"
