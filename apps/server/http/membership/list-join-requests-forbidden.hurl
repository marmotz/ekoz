# List a room's join requests without `room.manage_members` (issue #80) → 403
# "room.permission_denied". Set `access_token` to a plain member's (or a
# non-member's) token and `room_id` to a room they cannot moderate.
GET {{base_url}}/rooms/{{room_id}}/join-requests
Authorization: Bearer {{access_token}}
HTTP 403
[Asserts]
jsonpath "$.code" == "room.permission_denied"
