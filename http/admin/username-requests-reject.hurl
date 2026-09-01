# Reject a queued identifier change (technical.md §17, issue #20). Owner only.
# 204. Set `access_token` to an owner and `request_id` from the list.
POST {{base_url}}/admin/username-requests/{{request_id}}/reject
Authorization: Bearer {{access_token}}
HTTP 204
