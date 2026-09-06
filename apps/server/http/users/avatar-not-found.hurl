# A user's avatar when none is set (technical.md §13) → 404
# "identity.avatar_not_found". Set `access_token`.
GET {{base_url}}/users/owner/avatar
Authorization: Bearer {{access_token}}
HTTP 404
[Asserts]
jsonpath "$.code" == "identity.avatar_not_found"
