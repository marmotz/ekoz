# Password login blocked pending email verification (technical.md §9, §11,
# issue #16) → 403 "identity.email_not_verified".
#
# Applies while `email.verification_required` is on and the account has not
# confirmed its address yet. Needs such an account: register one (see
# auth/register.hurl) and set `identifier` to it, then run this before
# auth/verify-email.hurl.
POST {{base_url}}/auth/login
{
  "identifier": "bob",
  "password": "correct-horse-battery-staple"
}
HTTP 403
[Asserts]
jsonpath "$.code" == "identity.email_not_verified"
