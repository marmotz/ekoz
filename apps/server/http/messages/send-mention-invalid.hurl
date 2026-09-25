# A collective mention in a `dm` or `group_dm` → 422 "message.mention_invalid".
# Set `access_token` and `room_id` (a direct conversation).
POST {{base_url}}/rooms/{{room_id}}/messages
Authorization: Bearer {{access_token}}
{
  "body": "hello",
  "mentions": [{ "type": "all" }]
}
HTTP 422
[Asserts]
jsonpath "$.code" == "message.mention_invalid"
