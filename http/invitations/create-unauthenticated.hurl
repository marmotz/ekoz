# Create an invitation without a valid access token (technical.md §8, issue #15)
# → 401 "auth.unauthenticated". Passes as-is on any server.
POST {{base_url}}/invitations
Authorization: Bearer not-a-real-token
{}
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.unauthenticated"
