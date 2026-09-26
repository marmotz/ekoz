# Search the people the caller shares a room with — happy path (web-client-direct-messages S3).
# Active users only, at most 20, `query` is 2 to 100 characters. Set `access_token`.
GET {{base_url}}/me/contacts?query=al
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.items" isCollection
