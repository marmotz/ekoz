# Issue a registration invitation — happy path (technical.md §8, issue #15).
# Owners only. `email` optional (null = the link works for any address);
# `expiresInDays` optional (defaults to `invitation.ttl`, 7d).
#
# Set `access_token` to an owner's token. The token is shown once here.
#
# This creates an *unbound* invitation (no `email`) so any address can redeem it;
# add `"email": "friend@ekoz.localhost"` to bind it — registration then has to
# present that exact address.
POST {{base_url}}/invitations
Authorization: Bearer {{access_token}}
{}
HTTP 201
[Captures]
invite_token: jsonpath "$.token"
invitation_id: jsonpath "$.id"
[Asserts]
jsonpath "$.id" isString
jsonpath "$.token" isString
jsonpath "$.url" contains "/register?invite="
