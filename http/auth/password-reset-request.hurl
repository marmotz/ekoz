# Request a password reset (technical.md §10, issue #17). Always 202 — the
# response never reveals whether the account exists. A `password-reset` mail
# (1h TTL) is sent only for an existing, active account. Throttled (§14).
POST {{base_url}}/auth/password-reset/request
{
  "email": "owner@ekoz.localhost"
}
HTTP 202
[Asserts]
jsonpath "$.accepted" == true
