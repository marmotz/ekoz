# Create a group without `room.manage_groups` → 403 "room.permission_denied".
# Set `access_token` to a plain member's token and `room_id`.
POST {{base_url}}/rooms/{{room_id}}/groups
Authorization: Bearer {{access_token}}
{"name": "devs"}
HTTP 403
[Asserts]
jsonpath "$.code" == "room.permission_denied"
