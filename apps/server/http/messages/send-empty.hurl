# A message with neither a body nor an attachment is refused (technical.md
# §S9, issue #143). Set `access_token` and `room_id`.
POST {{base_url}}/rooms/{{room_id}}/messages
Authorization: Bearer {{access_token}}
{}
HTTP 422
[Asserts]
jsonpath "$.code" == "message.empty"
