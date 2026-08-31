# Issue an email-bound invitation (technical.md §8, issue #15). The `url` still
# points at /register, but registration must present exactly this address or it
# is rejected 422 "identity.invitation_invalid".
#
# Set `access_token` to an owner's token.
POST {{base_url}}/invitations
Authorization: Bearer {{access_token}}
{
  "email": "friend@ekoz.localhost",
  "expiresInDays": 14
}
HTTP 201
[Asserts]
jsonpath "$.id" isString
jsonpath "$.token" isString
