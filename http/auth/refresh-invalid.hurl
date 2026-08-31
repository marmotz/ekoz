# Refresh with an unknown or expired token (technical.md §7, ADR 0008) → 401
# "auth.refresh_invalid". Passes as-is on any server.
POST {{base_url}}/auth/refresh
{
  "refreshToken": "not-a-real-token"
}
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.refresh_invalid"
