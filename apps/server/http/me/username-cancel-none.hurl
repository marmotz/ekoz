# Cancel with no pending request (issue #102) → 404
# "identity.username_request_not_found". Set `access_token` of an account
# without a pending request.
DELETE {{base_url}}/me/username/request
Authorization: Bearer {{access_token}}
HTTP 404
[Asserts]
jsonpath "$.code" == "identity.username_request_not_found"
