# Revoke every session except the current one — happy path (technical.md §11,
# issue #14): DELETE /sessions?all=true. Returns `{ revoked: <count> }`. Set
# `access_token`. Without `?all=true` the request is 400
# "identity.sessions_bulk_scope_required".
DELETE {{base_url}}/sessions?all=true
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.revoked" isInteger
