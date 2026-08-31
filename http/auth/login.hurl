# Password login (technical.md §11, ADR 0008). `identifier` accepts a bare
# `name`, the full `name/server`, or the account email.
#
# A fresh local-dev server has no accounts yet (registration is #15, first-owner
# setup is #18), so this asserts the unknown-credentials 401 + problem+json
# shape. Once an account exists, expect:
#   HTTP 200
#   [Captures]
#   access_token: jsonpath "$.accessToken"
#   refresh_token: jsonpath "$.refreshToken"
POST {{base_url}}/auth/login
{
  "identifier": "nobody",
  "password": "wrong-password"
}
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.invalid_credentials"
jsonpath "$.status" == 401
