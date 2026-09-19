# Approve a pending join request — happy path (technical.md §9, issue #4).
# Needs `room.manage_members`. Set `access_token` to a privileged member's
# token, `room_id` and `join_request_id` (from `join-request.hurl`).
POST {{base_url}}/rooms/{{room_id}}/join-requests/{{join_request_id}}/approve
Authorization: Bearer {{access_token}}
HTTP 201
[Asserts]
jsonpath "$.roomId" == "{{room_id}}"
