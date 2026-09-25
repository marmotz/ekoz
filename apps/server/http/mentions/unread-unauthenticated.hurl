# Unread mention counters without a valid token → 401 "auth.unauthenticated".
# Passes as-is on any server.
GET {{base_url}}/me/mentions/unread
Authorization: Bearer not-a-real-token
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
