# Confirm with a bogus / expired / already-used reset token (technical.md §10)
# → 422 "auth.password_reset_invalid". Passes as-is on any server.
POST {{base_url}}/auth/password-reset/confirm
{
  "token": "not-a-real-reset-token",
  "newPassword": "a-brand-new-passphrase"
}
HTTP 422
[Asserts]
jsonpath "$.code" == "auth.password_reset_invalid"
