# The messages that mention the caller — happy path (web-client-mentions S5).
# Most recent mention first. Set `access_token`. For the next page add
# `?cursor=<nextCursor>`.
GET {{base_url}}/me/mentions?limit=30
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.items" isCollection
jsonpath "$.nextCursor" exists
