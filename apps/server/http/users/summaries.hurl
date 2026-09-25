# User summaries by id (issue #123). Auth required. `ids` is a comma-separated
# list of 1 to 100 user ids; the response follows the request order and an unknown
# or deleted id comes back with null fields. Set `access_token` and
# `target_user_id`.
GET {{base_url}}/users
Authorization: Bearer {{access_token}}
[QueryStringParams]
ids: {{target_user_id}},01ARZ3NDEKTSV4RRFFQ69G5FAV
HTTP 200
[Asserts]
jsonpath "$.items" count == 2
jsonpath "$.items[0].id" == "{{target_user_id}}"
jsonpath "$.items[1].id" == "01ARZ3NDEKTSV4RRFFQ69G5FAV"
jsonpath "$.items[1].identifier" == null
jsonpath "$.items[1].displayName" == null
