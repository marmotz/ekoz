# Manual away preference without a valid token → 401 "auth.unauthenticated".
# Passes as-is on any server.
PUT {{base_url}}/presence/preference
Authorization: Bearer not-a-real-token
{ "manualAway": true }
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
