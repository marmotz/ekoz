# Typing signal without a valid token → 401 "auth.unauthenticated".
# Passes as-is on any server.
POST {{base_url}}/rooms/any-room/typing
Authorization: Bearer not-a-real-token
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
