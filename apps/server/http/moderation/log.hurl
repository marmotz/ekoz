# Room-scoped view over the audit log — happy path (technical.md §17, issue
# #13). Needs a moderation capability (kick, ban or delete_any). Set
# `access_token` to a moderator's/admin's token and `room_id`.
GET {{base_url}}/rooms/{{room_id}}/moderation-log
Authorization: Bearer {{access_token}}
HTTP 200
