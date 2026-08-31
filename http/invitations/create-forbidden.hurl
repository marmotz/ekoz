# Create an invitation as a non-owner account (technical.md §8, §15) → 403
# "auth.forbidden". Set `access_token` to an ordinary (non-owner) account's
# token; invitations are owners-only in this increment.
POST {{base_url}}/invitations
Authorization: Bearer {{access_token}}
{}
HTTP 403
[Asserts]
jsonpath "$.code" == "auth.forbidden"
