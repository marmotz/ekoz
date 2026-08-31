# Logout (technical.md §7). Revokes the current session: its refresh token dies
# and its `sid` joins the in-memory denylist. Needs a valid access token.
#
# Without one this is 401. Real flow:
#   POST {{base_url}}/auth/logout
#   Authorization: Bearer {{access_token}}
#   HTTP 204
POST {{base_url}}/auth/logout
Authorization: Bearer not-a-real-token
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
