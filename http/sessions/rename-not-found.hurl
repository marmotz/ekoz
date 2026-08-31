# Rename a session that is not the caller's (technical.md §11, issue #14) → 404
# "identity.session_not_found". Needs a valid `access_token`; the id below is
# well-formed but not owned by the caller.
PATCH {{base_url}}/sessions/01000000000000000000000000
Authorization: Bearer {{access_token}}
{
  "deviceName": "Nope"
}
HTTP 404
[Asserts]
jsonpath "$.code" == "identity.session_not_found"
