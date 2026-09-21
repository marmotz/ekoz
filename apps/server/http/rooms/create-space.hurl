# Create a root space — happy path (technical.md §4, §7, issue #1). Creating a
# root space (no `parentId`) is owner-only for now (no parent node to check a
# capability against). Set `access_token` to an owner's token.
POST {{base_url}}/spaces
Authorization: Bearer {{access_token}}
{
  "name": "Engineering",
  "visibility": "public"
}
HTTP 201
[Asserts]
jsonpath "$.type" == "space"
jsonpath "$.visibility" == "public"
jsonpath "$.lastSeq" == "2"
