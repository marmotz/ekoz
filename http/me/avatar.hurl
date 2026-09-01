# Set the avatar (technical.md §13, issue #19): multipart, one `file`. Size is
# checked against `avatar.max_size_bytes`, the real type is sniffed against
# `avatar.allowed_mime`. Stored as a deduplicated server-core blob. Set
# `access_token` and point at a local image.
PUT {{base_url}}/me/avatar
Authorization: Bearer {{access_token}}
[MultipartFormData]
file: file,avatar.png; image/png
HTTP 200
[Asserts]
jsonpath "$.avatarUrl" matches /\/users\/[^/]+\/avatar$/
