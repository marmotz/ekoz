# Approve a queued identifier change (technical.md §17, issue #20): apply the
# new `name`, reserve the freed one, audit. Owner only. 201.
# Set `access_token` to an owner and `request_id` from the list.
POST {{base_url}}/admin/username-requests/{{request_id}}/approve
Authorization: Bearer {{access_token}}
HTTP 201
[Asserts]
jsonpath "$.identifier" isString
