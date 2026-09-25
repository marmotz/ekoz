# Unread mention counters per room — happy path (web-client-mentions S5).
# Every room type is covered. Set `access_token`.
GET {{base_url}}/me/mentions/unread
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.items" isCollection
