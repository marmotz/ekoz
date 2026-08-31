# Refresh-token rotation (technical.md §7, ADR 0008). Exchanges a valid opaque
# refresh token for a new access token + a new refresh token; replaying a
# consumed token revokes the whole session (`auth.refresh_reuse`).
#
# No token to present on a fresh server, so this asserts the invalid-token 401.
# Real flow, once you hold a refresh token from /auth/login:
#   POST {{base_url}}/auth/refresh
#   { "refreshToken": "{{refresh_token}}" }
#   HTTP 200
POST {{base_url}}/auth/refresh
{
  "refreshToken": "not-a-real-token"
}
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.refresh_invalid"
