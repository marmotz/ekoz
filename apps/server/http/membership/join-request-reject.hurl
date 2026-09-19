# Reject a pending join request — happy path (technical.md §9, issue #4).
# Needs `room.manage_members`. Set `access_token` to a privileged member's
# token, `room_id` and `join_request_id` (from a fresh `join-request.hurl`
# run — do not reuse the one consumed by `join-request-approve.hurl`).
POST {{base_url}}/rooms/{{room_id}}/join-requests/{{join_request_id}}/reject
Authorization: Bearer {{access_token}}
HTTP 204
