# Decline a pending invitation — happy path (technical.md §9, issue #4). Set
# `access_token` to the invitee's token and `invitation_id` (from a fresh
# `invite.hurl` run — do not reuse the one consumed by `accept-invitation.hurl`).
POST {{base_url}}/invitations/{{invitation_id}}/decline
Authorization: Bearer {{access_token}}
HTTP 204
