# Moderation log as a caller with no moderation capability (technical.md §17,
# issue #13) → 403 "room.permission_denied". Set `access_token` to an
# ordinary member's token and `room_id`.
GET {{base_url}}/rooms/{{room_id}}/moderation-log
Authorization: Bearer {{access_token}}
HTTP 403
[Asserts]
jsonpath "$.code" == "room.permission_denied"
