# Preview a room that is not invite-only (public, private, deleted or unknown)
# → 404 "room.not_found" (issue #64). Set `access_token` and `room_id` to a
# `visibility: "public"` or `"private"` room: a private room is never revealed.
GET {{base_url}}/rooms/{{room_id}}/preview
Authorization: Bearer {{access_token}}
HTTP 404
[Asserts]
jsonpath "$.code" == "room.not_found"
