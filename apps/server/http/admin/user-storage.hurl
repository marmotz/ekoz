# A user's storage usage and effective quota (technical.md §S11, issue #146).
# Set `access_token` to an owner and `target_user_id`.
GET {{base_url}}/admin/users/{{target_user_id}}/storage
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.usedBytes" isString
jsonpath "$.overridden" isBoolean
