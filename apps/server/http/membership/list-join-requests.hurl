# List a room's pending join requests, oldest first (issue #80). Set
# `access_token` to an account holding `room.manage_members` on `room_id` (the
# owner works); run `join-request.hurl` first to have one pending.
GET {{base_url}}/rooms/{{room_id}}/join-requests
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.items" isCollection
jsonpath "$.nextCursor" exists
