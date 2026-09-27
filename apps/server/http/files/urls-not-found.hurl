# Issue a signed URL for a ref (technical.md §S6). No feature registers an
# `attachment` / `message_preview` / `preview` access policy yet (that lands
# with #143/#144), so every ref currently denies. Set `access_token`.
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
