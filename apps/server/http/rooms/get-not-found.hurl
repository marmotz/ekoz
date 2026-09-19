# Room detail, unknown id (issue #1) → 404 "room.not_found". Any state.
GET {{base_url}}/rooms/01ARZ3NDEKTSV4RRFFQ69G5FAV
Authorization: Bearer {{access_token}}
HTTP 404
[Asserts]
jsonpath "$.code" == "room.not_found"
