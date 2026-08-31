# Email change without a valid access token (technical.md §9, issue #16) → 401
# "auth.unauthenticated". Passes as-is on any server.
POST {{base_url}}/me/email
Authorization: Bearer not-a-real-token
{
  "newEmail": "new@ekoz.localhost",
  "password": "correct-horse-battery-staple"
}
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
