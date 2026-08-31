# Change the authenticated account's email — happy path (technical.md §9, #16).
#
# Re-authenticates with `password`, sends verification to the new address and an
# `email-changed-notice` to the current one. `User.email` is applied only once
# the new address is verified (POST /auth/verify-email). 202, no leak.
#
# Set `access_token` and `password` for the caller.
POST {{base_url}}/me/email
Authorization: Bearer {{access_token}}
{
  "newEmail": "owner.new@ekoz.localhost",
  "password": "correct-horse-battery-staple"
}
HTTP 202
[Asserts]
jsonpath "$.accepted" == true
