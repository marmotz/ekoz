# Queued identifier changes awaiting an owner decision (technical.md §17, issue
# #20). Owner only. Optional `?status=pending|approved|rejected|cancelled`.
# Set `access_token` to an owner.
GET {{base_url}}/admin/username-requests?status=pending
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$" isCollection
