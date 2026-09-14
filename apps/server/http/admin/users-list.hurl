# List / search / filter accounts as an owner (technical.md §2.1, issue #14).
# Keyset pagination on (created_at desc, id desc); `q` searches name, email and
# UserProfile.displayName. Set `access_token` to an owner.
GET {{base_url}}/admin/users?limit=20
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.items" exists
jsonpath "$.nextCursor" exists
