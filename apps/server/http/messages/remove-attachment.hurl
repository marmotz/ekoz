# Remove an attachment — own deletion (`room.delete_own`) or moderation
# (`room.delete_any`, audited) (technical.md §S9, issue #143). Set
# `access_token`, `room_id`, `message_id` and `attachment_id` from
# send-attachments.hurl.
DELETE {{base_url}}/rooms/{{room_id}}/messages/{{message_id}}/attachments/{{attachment_id}}
Authorization: Bearer {{access_token}}
HTTP 204
