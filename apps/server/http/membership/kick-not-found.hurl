# Kick a user who is not a member (technical.md §9, issue #4) → 404
# "room.membership_not_found". Set `access_token` to a privileged member's
# token, `room_id` and `target_user_id` (not a member of that room).
DELETE {{base_url}}/rooms/{{room_id}}/members/{{target_user_id}}
Authorization: Bearer {{access_token}}
HTTP 404
[Asserts]
jsonpath "$.code" == "room.membership_not_found"
