# Resend the verification mail (technical.md §9, issue #16). Always 202 — the
# response never reveals whether the address exists; a mail is sent only for an
# existing, active, still-unverified account.
POST {{base_url}}/auth/verify-email/resend
{
  "email": "nobody@ekoz.localhost"
}
HTTP 202
[Asserts]
jsonpath "$.accepted" == true
