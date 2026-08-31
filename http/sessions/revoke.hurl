# Revoke one session (technical.md §11, issue #14): DELETE /sessions/:id. The
# session's `sid` joins the denylist so its access token stops working within
# the access-token TTL. Needs a valid access token.
#
# Real flow:
#   DELETE {{base_url}}/sessions/{{session_id}}
#   Authorization: Bearer {{access_token}}
#   HTTP 204
DELETE {{base_url}}/sessions/01000000000000000000000000
Authorization: Bearer not-a-real-token
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
