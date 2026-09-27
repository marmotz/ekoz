# Add an attachment through PATCH — author only, within `messages.edit_window`
# (technical.md §S9, issue #143). Set `access_token`, `room_id`, `message_id`
# (from send-mentions.hurl or send-attachments.hurl) and a fresh `upload_id`
# (re-run uploads/create.hurl + patch-complete.hurl; the earlier one may
# already have been consumed by another chain).
PATCH {{base_url}}/rooms/{{room_id}}/messages/{{message_id}}
Authorization: Bearer {{access_token}}
{
  "attachments": { "add": ["{{upload_id}}"] }
}
HTTP 200
[Asserts]
jsonpath "$.attachments" count >= 1
