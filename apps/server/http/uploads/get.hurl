# Non-tus JSON recovery view (technical.md §S4). Owner only. Set
# `access_token` and `upload_id`.
GET {{base_url}}/uploads/{{upload_id}}
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{upload_id}}"
jsonpath "$.state" isString
jsonpath "$.offset" isString
jsonpath "$.length" isString
