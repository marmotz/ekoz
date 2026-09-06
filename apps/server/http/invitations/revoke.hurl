# Revoke an invitation — happy path (technical.md §8, issue #15). Owners only.
# Marks the row consumed with no consumer; idempotent on an already-consumed
# row. 204, no body.
#
# Set `access_token` to an owner's token and `invitation_id` from
# invitations/create.hurl or invitations/list.hurl.
DELETE {{base_url}}/invitations/{{invitation_id}}
Authorization: Bearer {{access_token}}
HTTP 204
