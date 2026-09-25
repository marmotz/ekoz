# List a window around a `seq` — happy path (web-client-mentions S6). `floor(limit/2)`
# messages before it, then the rest from it on, ascending. Set `access_token`,
# `room_id` and `message_seq` (the `seq` of a message of that room).
GET {{base_url}}/rooms/{{room_id}}/messages?around={{message_seq}}&limit=50
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.items" isCollection
jsonpath "$.hasMore" isBoolean
jsonpath "$.hasMoreNewer" isBoolean
