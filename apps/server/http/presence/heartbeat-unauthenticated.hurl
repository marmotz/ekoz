# Presence heartbeat without a valid token → 401 "auth.unauthenticated".
# Passes as-is on any server.
POST {{base_url}}/presence/heartbeat
Authorization: Bearer not-a-real-token
{}
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
