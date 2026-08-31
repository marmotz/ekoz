# Owner-created account without a valid access token (technical.md §8, #15) →
# 401 "auth.unauthenticated". Passes as-is on any server.
POST {{base_url}}/admin/users
Authorization: Bearer not-a-real-token
{
  "name": "carol",
  "email": "carol@ekoz.localhost",
  "password": "correct-horse-battery-staple",
  "displayName": "Carol"
}
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
