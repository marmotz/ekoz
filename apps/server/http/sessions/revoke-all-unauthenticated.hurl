# Bulk session revoke without a valid access token (technical.md §11, #14) →
# 401 "auth.unauthenticated". Passes as-is on any server.
DELETE {{base_url}}/sessions?all=true
Authorization: Bearer not-a-real-token
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
