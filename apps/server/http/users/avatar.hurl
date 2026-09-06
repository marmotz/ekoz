# Stream a user's avatar (technical.md §13, issue #19). Auth required. Same
# content-addressed response as `GET /blobs/:id`: `ETag` on the blob hash, long
# immutable cache. 404 when the user has no avatar. Set `access_token`.
GET {{base_url}}/users/owner/avatar
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
header "ETag" exists
