# List the caller's pending room invitations, newest first (issue #63). Set
# `access_token` to the invitee's token; run `invite.hurl` first to have one.
GET {{base_url}}/me/room-invitations
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.items" isCollection
