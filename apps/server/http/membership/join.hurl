# Join a public room — happy path (technical.md §9, issue #4). Set
# `access_token` to a non-member's token and `room_id` to a `visibility:
# "public"` room.
POST {{base_url}}/rooms/{{room_id}}/join
Authorization: Bearer {{access_token}}
HTTP 201
[Asserts]
jsonpath "$.roomId" == "{{room_id}}"
