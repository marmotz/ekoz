# Join a private room directly (technical.md §9, issue #4) → 422
# "room.not_joinable" — ask for an invitation or a join request instead. Set
# `access_token` to a non-member's token and `room_id` to a `visibility:
# "private"` room.
POST {{base_url}}/rooms/{{room_id}}/join
Authorization: Bearer {{access_token}}
HTTP 422
[Asserts]
jsonpath "$.code" == "room.not_joinable"
