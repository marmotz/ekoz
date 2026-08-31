# Registration with an identifier that is already taken (technical.md §5, §8,
# issue #15) → 409 "identity.username_taken".
#
# Availability is checked after the invitation, so in invite mode this needs a
# valid `invite_token` AND `name` set to an existing account's identifier
# (`identifier` defaults to the owner's). A reserved name gives the same code.
POST {{base_url}}/auth/register
{
  "name": "owner",
  "email": "someone-else@ekoz.localhost",
  "password": "correct-horse-battery-staple",
  "displayName": "Impersonator",
  "invitationToken": "{{invite_token}}"
}
HTTP 409
[Asserts]
jsonpath "$.code" == "identity.username_taken"
