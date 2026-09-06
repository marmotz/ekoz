# Rename one session — happy path (technical.md §11, issue #14): PATCH
# /sessions/:id with a new `deviceName`. Set `access_token` and `session_id`
# (from sessions/list.hurl); a session id that is not the caller's is 404.
PATCH {{base_url}}/sessions/{{session_id}}
Authorization: Bearer {{access_token}}
{
  "deviceName": "Work laptop"
}
HTTP 200
[Asserts]
jsonpath "$.deviceName" == "Work laptop"
jsonpath "$.id" == "{{session_id}}"
