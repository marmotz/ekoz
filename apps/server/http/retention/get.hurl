# This room's own retention rule and the resolved effective rule — happy
# path (technical.md §13, issue #12). Set `access_token` and `room_id`.
GET {{base_url}}/rooms/{{room_id}}/retention
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
jsonpath "$.rule.mode" exists
jsonpath "$.effective.mode" exists
