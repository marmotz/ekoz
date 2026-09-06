# Email change with the wrong current password (technical.md §9, issue #16) →
# 401 "auth.invalid_credentials". Needs a valid `access_token`; the password
# below is deliberately wrong.
POST {{base_url}}/me/email
Authorization: Bearer {{access_token}}
{
  "newEmail": "new@ekoz.localhost",
  "password": "definitely-not-the-password"
}
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.invalid_credentials"
