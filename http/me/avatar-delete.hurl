# Remove the current avatar (technical.md §13, issue #19): release the blob,
# null `avatarBlobId`. Idempotent. 204. Set `access_token`.
DELETE {{base_url}}/me/avatar
Authorization: Bearer {{access_token}}
HTTP 204
