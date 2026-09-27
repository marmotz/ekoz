# List every configuration parameter, masked and with its provenance
# (technical.md §2, issue #145). Set `access_token` to an owner.
GET {{base_url}}/admin/settings
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$" isCollection
jsonpath "$[0].key" isString
jsonpath "$[0].source" matches "^(default|file|settings|env)$"
