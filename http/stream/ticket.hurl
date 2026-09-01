# Mint an SSE stream ticket — happy path (technical.md §12, issue #23). Returns a
# single-use, ~30 s token the `GET /events` consumer accepts in its query
# string. Set `access_token` from a login.
POST {{base_url}}/stream/ticket
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.ticket" isString
jsonpath "$.expiresIn" isInteger
jsonpath "$.expiresIn" greater 0
