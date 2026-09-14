# Account detail for an unknown id (technical.md §2.2, issue #14) → 404
# "identity.user_not_found". Passes as-is on any server. Set `access_token`
# to an owner.
GET {{base_url}}/admin/users/01ARZ3NDEKTSV4RRFFQ69G5FAV
Authorization: Bearer {{access_token}}
HTTP 404
[Asserts]
jsonpath "$.code" == "identity.user_not_found"
