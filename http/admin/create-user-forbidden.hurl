# Owner-created account as a non-owner (technical.md §8, §16, issue #15) → 403
# "auth.forbidden". Set `access_token` to an ordinary (non-owner) account's
# token.
POST {{base_url}}/admin/users
Authorization: Bearer {{access_token}}
{
  "name": "carol",
  "email": "carol@ekoz.localhost",
  "password": "correct-horse-battery-staple",
  "displayName": "Carol"
}
HTTP 403
[Asserts]
jsonpath "$.code" == "auth.forbidden"
