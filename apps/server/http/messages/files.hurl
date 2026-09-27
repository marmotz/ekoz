# List the room's attachments, newest first (technical.md §S9, issue #143).
# Needs `room.read`. Set `access_token` and `room_id`; optionally add
# `?kind=media` or `?kind=documents`.
GET {{base_url}}/rooms/{{room_id}}/files?limit=50
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.items" isCollection
jsonpath "$.nextCursor" exists
