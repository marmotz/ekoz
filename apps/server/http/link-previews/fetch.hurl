# Fetch a link preview — happy path (technical.md §S10, issue #144). Needs
# `access_token` and `link_previews.enabled = true`. Fetches example.com live
# (a stable, SSRF-safe public page with no Open Graph tags, so `title` falls
# back to the plain `<title>` and `hasImage` is `false`).
POST {{base_url}}/link-previews
Authorization: Bearer {{access_token}}
{
  "url": "https://example.com/"
}
HTTP 200
[Asserts]
jsonpath "$.url" == "https://example.com/"
jsonpath "$.title" == "Example Domain"
jsonpath "$.hasImage" == false
