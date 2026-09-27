# Link previews are off by default (technical.md §S10, issue #144). Passes
# as-is on a fresh server; set `access_token`.
POST {{base_url}}/link-previews
Authorization: Bearer {{access_token}}
{
  "url": "https://example.com/"
}
HTTP 404
[Asserts]
jsonpath "$.code" == "link_preview.disabled"
