# List the caller's direct and group conversations — happy path (web-client-direct-messages S2).
# Newest activity first; a conversation the caller hid is left out. Set `access_token`.
GET {{base_url}}/me/conversations
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.items" isCollection
