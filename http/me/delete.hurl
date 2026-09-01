# Delete the own account (technical.md §15, issue #21): re-authenticates with
# `password`, then one transaction — status `deleted`, sessions revoked, profile
# scrubbed, `name` / `email` nulled, identifier reserved. 204.
#
# Destructive: use a throwaway account's `access_token`.
DELETE {{base_url}}/me
Authorization: Bearer {{access_token}}
{
  "password": "correct-horse-battery-staple"
}
HTTP 204
