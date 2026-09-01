# A public profile for an unknown / deleted identifier (technical.md §13) → 404
# "identity.profile_not_found". Set `access_token`.
GET {{base_url}}/users/nobody
Authorization: Bearer {{access_token}}
HTTP 404
[Asserts]
jsonpath "$.code" == "identity.profile_not_found"
