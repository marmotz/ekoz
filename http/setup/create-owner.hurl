# First-owner setup — happy path (technical.md §1, ADR 0010, issue #18).
#
# ONE-SHOT: a success creates the first owner and closes /setup/* for good
# (every later call → 410 "setup.closed"). Only passes when:
#   - the database is fresh (no owner yet), and
#   - `setup_token` is the real token from the server logs (token-pinned boot),
#     OR the boot is email-pinned and `owner_email` == EKOZ_INITIAL_OWNER_EMAIL
#     (the `token` field is then ignored).
#
# On an email-pinned boot, drop the `token` line.
POST {{base_url}}/setup/owner
{
  "token": "{{setup_token}}",
  "email": "owner@ekoz.localhost",
  "password": "correct-horse-battery-staple",
  "name": "owner",
  "displayName": "The Owner"
}
HTTP 201
[Captures]
access_token: jsonpath "$.accessToken"
refresh_token: jsonpath "$.refreshToken"
session_id: jsonpath "$.session.id"
[Asserts]
jsonpath "$.user.isOwner" == true
jsonpath "$.user.emailVerified" == true
jsonpath "$.user.identifier" endsWith "/ekoz.localhost"
jsonpath "$.accessToken" isString
jsonpath "$.session.current" == true
