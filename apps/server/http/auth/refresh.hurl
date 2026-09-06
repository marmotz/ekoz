# Refresh-token rotation — happy path (technical.md §7, ADR 0008).
#
# Exchanges a valid opaque refresh token for a new access token + a new refresh
# token (the old one is now consumed). Set `refresh_token` from POST /auth/login
# or POST /setup/owner.
POST {{base_url}}/auth/refresh
{
  "refreshToken": "{{refresh_token}}"
}
HTTP 200
[Captures]
access_token: jsonpath "$.accessToken"
refresh_token: jsonpath "$.refreshToken"
[Asserts]
jsonpath "$.accessToken" isString
jsonpath "$.refreshToken" isString
jsonpath "$.expiresIn" isInteger
