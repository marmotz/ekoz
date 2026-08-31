# List invitations — happy path (technical.md §8, issue #15). Owners only; each
# row carries `status` (pending | accepted | revoked | expired). Newest first.
#
# Set `access_token` to an owner's token.
GET {{base_url}}/invitations
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$" isCollection
