# Rename one session (technical.md §11, issue #14): PATCH /sessions/:id with a
# new `deviceName`. Needs a valid access token; a session id that is not the
# caller's is 404.
#
# Real flow:
#   PATCH {{base_url}}/sessions/{{session_id}}
#   Authorization: Bearer {{access_token}}
#   { "deviceName": "Work laptop" }
#   HTTP 200
PATCH {{base_url}}/sessions/01000000000000000000000000
Authorization: Bearer not-a-real-token
{
  "deviceName": "Work laptop"
}
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
