# Email change to an address another account already uses (technical.md §9,
# issue #16) → 409 "identity.email_taken".
#
# Needs a valid `access_token` and `newEmail` set to an existing account's
# address (e.g. another user you registered).
POST {{base_url}}/me/email
Authorization: Bearer {{access_token}}
{
  "newEmail": "bob@ekoz.localhost",
  "password": "correct-horse-battery-staple"
}
HTTP 409
[Asserts]
jsonpath "$.code" == "identity.email_taken"
