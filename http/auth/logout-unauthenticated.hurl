# Logout without a valid access token (technical.md §7) → 401
# "auth.unauthenticated". Passes as-is on any server.
POST {{base_url}}/auth/logout
Authorization: Bearer not-a-real-token
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
