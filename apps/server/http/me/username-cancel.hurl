# Cancel the caller's pending identifier change request (issue #102). 204.
# Needs `access_token` of an account with a pending request (approval mode:
# `PATCH /me/username` first).
DELETE {{base_url}}/me/username/request
Authorization: Bearer {{access_token}}
HTTP 204
