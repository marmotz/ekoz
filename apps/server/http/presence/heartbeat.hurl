# Presence heartbeat — happy path (presence and typing S2, S5). Returns the
# caller's status and the timing settings a client should follow. Set
# `access_token`.
POST {{base_url}}/presence/heartbeat
Authorization: Bearer {{access_token}}
{ "clientId": "hurl" }
HTTP 201
[Asserts]
jsonpath "$.status" isString
jsonpath "$.manualAway" isBoolean
jsonpath "$.heartbeatInterval" isInteger
jsonpath "$.typingTtl" isInteger
