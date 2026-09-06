# Account registration — happy path (technical.md §8, issue #15).
#
# Body shape depends on the runtime `registration.mode`:
#   open   — { name, email, password, displayName }
#   invite — also { invitationToken }
# A fresh server ships `registration.mode = invite`, so this sends an invitation
# token. Set `invite_token` from POST /invitations first (or switch the server to
# `open` mode and drop the field).
#
# 201. When `email.verification_required` (the default) the account is created
# unverified and login is blocked until POST /auth/verify-email.
POST {{base_url}}/auth/register
{
  "name": "bob",
  "email": "bob@ekoz.localhost",
  "password": "correct-horse-battery-staple",
  "displayName": "Bob",
  "invitationToken": "{{invite_token}}"
}
HTTP 201
[Asserts]
jsonpath "$.identifier" == "bob/ekoz.localhost"
jsonpath "$.isOwner" == false
jsonpath "$.emailVerified" == false
jsonpath "$.status" == "active"
