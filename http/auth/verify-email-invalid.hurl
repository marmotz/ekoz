# Confirm an email address with an unknown / expired / already-consumed token
# (technical.md §9, issue #16) → 422 "identity.email_verification_invalid".
# Passes as-is on any server.
POST {{base_url}}/auth/verify-email
{
  "token": "not-a-real-verification-token"
}
HTTP 422
[Asserts]
jsonpath "$.code" == "identity.email_verification_invalid"
