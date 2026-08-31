# Revoke one session — happy path (technical.md §11, issue #14): DELETE
# /sessions/:id. The session's `sid` joins the denylist so its access token
# stops working within the access-token TTL. 204, no body.
#
# Set `access_token` and `session_id`. Revoking your current session logs you
# out; target another session's id to keep this one alive.
DELETE {{base_url}}/sessions/{{session_id}}
Authorization: Bearer {{access_token}}
HTTP 204
