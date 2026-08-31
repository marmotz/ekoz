# Revoke every session except the current one (technical.md §11, issue #14):
# DELETE /sessions?all=true. Returns `{ revoked: <count> }`. Needs a valid
# access token.
#
# Real flow:
#   DELETE {{base_url}}/sessions?all=true
#   Authorization: Bearer {{access_token}}
#   HTTP 200
DELETE {{base_url}}/sessions?all=true
Authorization: Bearer not-a-real-token
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
