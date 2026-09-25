# User summaries with a malformed id (issue #123) → 422 "validation_failed".
# Set `access_token`.
GET {{base_url}}/users
Authorization: Bearer {{access_token}}
[QueryStringParams]
ids: not-an-id
HTTP 422
[Asserts]
jsonpath "$.code" == "validation_failed"
