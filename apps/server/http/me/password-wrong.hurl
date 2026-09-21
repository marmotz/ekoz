# Password change with the wrong current password (issue #101) → 401
# "auth.invalid_credentials". Needs a valid `access_token`; the current password
# below is deliberately wrong.
POST {{base_url}}/me/password
Authorization: Bearer {{access_token}}
{
  "currentPassword": "definitely-not-the-password",
  "newPassword": "another-correct-horse-battery-staple"
}
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.invalid_credentials"
