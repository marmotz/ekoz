# Password change to a password below the policy (issue #101) → 422
# "identity.password_too_weak". Set `access_token` and the real current password.
POST {{base_url}}/me/password
Authorization: Bearer {{access_token}}
{
  "currentPassword": "correct-horse-battery-staple",
  "newPassword": "short"
}
HTTP 422
[Asserts]
jsonpath "$.code" == "identity.password_too_weak"
