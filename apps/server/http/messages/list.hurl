# List a room's messages — happy path (issue #66). Newest page first, ascending
# inside the page. Set `access_token` and `room_id` to a room the caller can read.
# For the previous page, add `?before=<seq of the first item>`.
GET {{base_url}}/rooms/{{room_id}}/messages?limit=50
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.items" isCollection
jsonpath "$.lastSeq" isString
jsonpath "$.hasMore" isBoolean
