# The caller's storage usage against their quota (technical.md §S8). Set
# `access_token`.
GET {{base_url}}/me/storage
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.usedBytes" isString
jsonpath "$.pendingBytes" isString
