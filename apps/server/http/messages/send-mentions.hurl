# Send a message that mentions a user and everyone — happy path (web-client-mentions S3).
# Needs `room.post` in a channel. Set `access_token`, `room_id` and `target_user_id`
# (an effective member of the room). The server freezes each token and audience.
POST {{base_url}}/rooms/{{room_id}}/messages
Authorization: Bearer {{access_token}}
{
  "body": "hello everyone",
  "mentions": [
    { "type": "user", "userId": "{{target_user_id}}" },
    { "type": "all" }
  ]
}
HTTP 201
[Captures]
message_id: jsonpath "$.id"
[Asserts]
jsonpath "$.mentions" count == 2
jsonpath "$.mentions[1].token" == "@all"
