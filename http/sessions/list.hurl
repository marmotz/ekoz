# List the caller's sessions (technical.md §11, issue #14). The current session
# is flagged with `current: true`. Needs a valid access token.
#
# Real flow:
#   GET {{base_url}}/sessions
#   Authorization: Bearer {{access_token}}
#   HTTP 200
GET {{base_url}}/sessions
Authorization: Bearer not-a-real-token
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
