# Send a message with a link preview — happy path (technical.md §S10, issue
# #144). Needs `room.post`, `link_previews.enabled = true`, `access_token`
# and `room_id`. Fetches example.com live.
POST {{base_url}}/rooms/{{room_id}}/messages
Authorization: Bearer {{access_token}}
{
  "body": "see https://example.com/",
  "linkPreviewUrl": "https://example.com/"
}
HTTP 201
[Asserts]
jsonpath "$.linkPreview.url" == "https://example.com/"
jsonpath "$.linkPreview.title" == "Example Domain"
