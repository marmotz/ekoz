# List the caller's sessions — happy path (technical.md §11, issue #14). The
# current session is flagged `current: true`. Set `access_token` from a login.
GET {{base_url}}/sessions
Authorization: Bearer {{access_token}}
HTTP 200
[Captures]
session_id: jsonpath "$[0].id"
[Asserts]
jsonpath "$" isCollection
jsonpath "$[0].id" isString
jsonpath "$[*].current" includes true
