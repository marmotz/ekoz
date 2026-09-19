# Join a public room while banned (technical.md §9, issue #4) → 403
# "room.banned". Set `access_token` to a banned (non-member) user's token and
# `room_id` to the room they were banned from (see `ban.hurl`).
POST {{base_url}}/rooms/{{room_id}}/join
Authorization: Bearer {{access_token}}
HTTP 403
[Asserts]
jsonpath "$.code" == "room.banned"
