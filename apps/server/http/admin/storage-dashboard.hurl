# Server-wide storage dashboard (technical.md §S11, issue #146). Set
# `access_token` to an owner.
GET {{base_url}}/admin/storage
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.usedBytes" isString
jsonpath "$.blobCount" isInteger
jsonpath "$.driver" matches "^(local|s3)$"
jsonpath "$.mediaTools.available" isBoolean
