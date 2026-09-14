# Owner-triggered password reset (technical.md §2.3, issue #14): mints a
# token and sends the existing `password-reset` mail. Not throttled. Set
# `access_token` to an owner and `target_user_id`.
POST {{base_url}}/admin/users/{{target_user_id}}/password-reset
Authorization: Bearer {{access_token}}
HTTP 202
[Asserts]
jsonpath "$.accepted" == true
