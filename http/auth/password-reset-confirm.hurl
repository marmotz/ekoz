# Confirm a password reset (technical.md §10, issue #17): set the new password,
# revoke every session of the account, audit `auth.password_reset`. 204.
#
# Set `reset_token` from the `password-reset` mail (Mailpit, the `?token=...`).
POST {{base_url}}/auth/password-reset/confirm
{
  "token": "{{reset_token}}",
  "newPassword": "a-brand-new-passphrase"
}
HTTP 204
