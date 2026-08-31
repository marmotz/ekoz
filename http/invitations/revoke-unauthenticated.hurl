# Revoke an invitation without a valid access token (technical.md §8, #15) →
# 401 "auth.unauthenticated". Passes as-is on any server.
DELETE {{base_url}}/invitations/01000000000000000000000000
Authorization: Bearer not-a-real-token
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
