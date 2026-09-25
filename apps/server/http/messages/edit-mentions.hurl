# Edit a message and replace its mention targets — happy path (web-client-mentions S3).
# Needs `room.edit_own` (author) or `room.edit_any`. Set `access_token`, `room_id`
# and `message_id`. `mentions` absent leaves the targets alone; present, it is the
# full new list: kept targets keep their token and audience, added ones are resolved now.
PATCH {{base_url}}/rooms/{{room_id}}/messages/{{message_id}}
Authorization: Bearer {{access_token}}
{
  "body": "edited",
  "mentions": [{ "type": "all" }]
}
HTTP 200
[Asserts]
jsonpath "$.mentions" count == 1
