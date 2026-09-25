# List the messages after a `seq` — happy path (web-client-mentions S6). The oldest
# `limit` messages with `seq > after`, ascending. Set `access_token`, `room_id` and
# `message_seq` (the `seq` of a message of that room).
GET {{base_url}}/rooms/{{room_id}}/messages?after={{message_seq}}&limit=50
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.items" isCollection
jsonpath "$.hasMore" isBoolean
jsonpath "$.hasMoreNewer" isBoolean
