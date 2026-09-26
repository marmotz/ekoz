# Typing signal — happy path. Delivered to the effective members of the room
# except the sender. Set `access_token` and `room_id` (needs room.post).
POST {{base_url}}/rooms/{{room_id}}/typing
Authorization: Bearer {{access_token}}
HTTP 204
