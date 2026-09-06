# Revoke a session without a valid access token (technical.md §11, issue #14) →
# 401 "auth.unauthenticated". Passes as-is on any server.
DELETE {{base_url}}/sessions/01000000000000000000000000
Authorization: Bearer not-a-real-token
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
