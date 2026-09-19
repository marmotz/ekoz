# Accept a pending invitation — happy path (technical.md §9, issue #4). Set
# `access_token` to the invitee's token and `invitation_id` (from
# `invite.hurl`).
POST {{base_url}}/invitations/{{invitation_id}}/accept
Authorization: Bearer {{access_token}}
HTTP 201
[Asserts]
jsonpath "$.userId" isString
