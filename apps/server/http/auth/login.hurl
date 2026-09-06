# Password login — happy path (technical.md §11, ADR 0008).
#
# `identifier` accepts a bare `name`, the full `name/server`, or the account
# email. Needs an existing, active, email-verified account: set `identifier` /
# `password` (the owner from /setup/owner works).
POST {{base_url}}/auth/login
{
  "identifier": "owner",
  "password": "correct-horse-battery-staple"
}
HTTP 200
[Captures]
access_token: jsonpath "$.accessToken"
refresh_token: jsonpath "$.refreshToken"
session_id: jsonpath "$.session.id"
[Asserts]
jsonpath "$.accessToken" matches /^[\w-]+\.[\w-]+\.[\w-]+$/
jsonpath "$.refreshToken" isString
jsonpath "$.expiresIn" isInteger
jsonpath "$.session.current" == true
