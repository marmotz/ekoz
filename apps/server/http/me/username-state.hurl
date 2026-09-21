# State of the identifier change for the caller (issue #102): the policy, the end
# of the cooldown (`available` only) and the pending request (any policy).
# Set `access_token`.
GET {{base_url}}/me/username
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.policy" exists
jsonpath "$.nextChangeAt" exists
jsonpath "$.pendingRequest" exists
