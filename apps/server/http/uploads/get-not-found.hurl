# An unknown or someone else's upload id reads as not-found (technical.md
# §S4) — the same answer either way, so ownership is never leaked. Set
# `access_token`.
GET {{base_url}}/uploads/01JQZZZZZZZZZZZZZZZZZZZZZZ
Authorization: Bearer {{access_token}}
HTTP 404
[Asserts]
jsonpath "$.code" == "upload.not_found"
