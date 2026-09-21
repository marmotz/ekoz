# Preview an invite-only room as a non-member (technical.md §9, issue #64).
# Set `access_token` to any account's token and `room_id` to a room whose
# `visibility` is "invite". `joinRequest` is null until the caller asks to join.
GET {{base_url}}/rooms/{{room_id}}/preview
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{room_id}}"
jsonpath "$.type" exists
jsonpath "$.name" exists
jsonpath "$.joinRequest" exists
