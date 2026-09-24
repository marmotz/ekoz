# The caller's spaces and channels, with the ancestor spaces that place them
# (issue #79). Set `access_token` to any account's token; an account without
# any membership gets an empty `items`.
GET {{base_url}}/rooms
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.items" isCollection
