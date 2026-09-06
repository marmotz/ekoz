# Mint an SSE stream ticket without a valid access token (technical.md §12,
# issue #23) → 401 "auth.unauthenticated". Passes as-is on any server.
POST {{base_url}}/stream/ticket
Authorization: Bearer not-a-real-token
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
