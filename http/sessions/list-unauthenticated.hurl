# List sessions without a valid access token (technical.md §11, issue #14) →
# 401 "auth.unauthenticated". Passes as-is on any server.
GET {{base_url}}/sessions
Authorization: Bearer not-a-real-token
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
