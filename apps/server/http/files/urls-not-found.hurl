# Issue a signed URL for a ref (technical.md §S6) that does not resolve: an
# unknown attachment id, or a `message_preview` / `preview` ref (#144 has not
# registered those policies yet). Set `access_token`.
POST {{base_url}}/files/urls
Authorization: Bearer {{access_token}}
{
  "items": [
    { "kind": "attachment", "id": "01JQZZZZZZZZZZZZZZZZZZZZZZ", "variant": "original" }
  ]
}
HTTP 201
[Asserts]
jsonpath "$.items[0].error" == "files.not_found"
