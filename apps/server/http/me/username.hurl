# Change the identifier (technical.md §17, issue #20). Behaviour depends on
# `identity.username_change_policy`:
#   immutable  → 403 identity.username_immutable
#   available  → 200 { status: "applied", identifier }
#   approval   → 200 { status: "pending", requestId }
# Set `access_token`.
PATCH {{base_url}}/me/username
Authorization: Bearer {{access_token}}
{
  "name": "owner-renamed"
}
HTTP 200
[Asserts]
jsonpath "$.status" exists
