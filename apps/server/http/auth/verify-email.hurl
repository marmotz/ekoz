# Confirm an email address — happy path (technical.md §9, issue #16).
#
# Consumes the token from the `email-verification` mail and stamps the address
# verified (an already-verified address still returns 200). Set `verify_token`
# from the mail: Mailpit UI on http://localhost:8025, `?token=...` in the link.
#
# Also the completion step of an email change (POST /me/email): same endpoint,
# the token then applies the new address.
POST {{base_url}}/auth/verify-email
{
  "token": "{{verify_token}}"
}
HTTP 200
[Asserts]
jsonpath "$.verified" == true
