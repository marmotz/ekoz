# Account detail as an owner (technical.md §2.2, issue #14): the list item
# shape plus `emailVerifiedAt` and the active-session count. Set
# `access_token` to an owner and `target_user_id`.
GET {{base_url}}/admin/users/{{target_user_id}}
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{target_user_id}}"
jsonpath "$.activeSessionCount" exists
