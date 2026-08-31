# Revoke an invitation id that does not exist (technical.md §8, issue #15) →
# 404 "identity.invitation_not_found". Needs an owner `access_token`; the id
# below is well-formed but unused.
DELETE {{base_url}}/invitations/01000000000000000000000000
Authorization: Bearer {{access_token}}
HTTP 404
[Asserts]
jsonpath "$.code" == "identity.invitation_not_found"
