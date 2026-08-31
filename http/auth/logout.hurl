# Logout — happy path (technical.md §7). Revokes the current session: its
# refresh token dies and its `sid` joins the in-memory denylist, so the access
# token stops working within its TTL. 204, no body.
#
# Set `access_token` from a login. This consumes that session — re-login for
# further requests.
POST {{base_url}}/auth/logout
Authorization: Bearer {{access_token}}
HTTP 204
