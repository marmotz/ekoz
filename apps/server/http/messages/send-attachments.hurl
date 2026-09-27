# Send a message with attachments — happy path (technical.md §S9, issue #143).
# Needs `room.post` + `room.attach` in the room. Set `access_token`, `room_id`
# and `upload_id` (a caller-owned, `ready` upload from POST /uploads +
# PATCH .../uploads/:id — see http/uploads/create.hurl). Captures `message_id`
# and `attachment_id` for edit-attachments.hurl / remove-attachment.hurl.
POST {{base_url}}/rooms/{{room_id}}/messages
Authorization: Bearer {{access_token}}
{
  "attachments": ["{{upload_id}}"]
}
HTTP 201
[Captures]
message_id: jsonpath "$.id"
attachment_id: jsonpath "$.attachments[0].id"
[Asserts]
jsonpath "$.body" == ""
jsonpath "$.attachments" count == 1
jsonpath "$.attachments[0].filename" isString
