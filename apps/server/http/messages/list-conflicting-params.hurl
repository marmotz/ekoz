# `before`, `after` and `around` are mutually exclusive → 422 validation error.
# Set `access_token` and `room_id`.
GET {{base_url}}/rooms/{{room_id}}/messages?before=10&after=5
Authorization: Bearer {{access_token}}
HTTP 422
