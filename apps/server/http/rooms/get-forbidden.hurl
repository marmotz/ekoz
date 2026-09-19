# Room detail on a private room as a non-member (technical.md §6, issues
# #1, #4) → 403 "room.permission_denied". Set `access_token` to a non-owner,
# non-member account's token and `room_id` to a `visibility: "private"` room.
GET {{base_url}}/rooms/{{room_id}}
Authorization: Bearer {{access_token}}
HTTP 403
[Asserts]
jsonpath "$.code" == "room.permission_denied"
