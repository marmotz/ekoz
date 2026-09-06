# Owner-created account — happy path (technical.md §8, §16, issue #15). Used
# when `registration.mode = admin`, but works in any mode. The account is
# created with its email already verified. Pass `isOwner: true` to mint another
# owner.
#
# Set `access_token` to an owner's token.
POST {{base_url}}/admin/users
Authorization: Bearer {{access_token}}
{
  "name": "carol",
  "email": "carol@ekoz.localhost",
  "password": "correct-horse-battery-staple",
  "displayName": "Carol"
}
HTTP 201
[Asserts]
jsonpath "$.identifier" == "carol/ekoz.localhost"
jsonpath "$.emailVerified" == true
jsonpath "$.isOwner" == false
