# A reserved group name (`all` or a role name) → 422 "group.name_reserved".
# Needs `room.manage_groups`. Set `access_token` and `room_id`.
POST {{base_url}}/rooms/{{room_id}}/groups
Authorization: Bearer {{access_token}}
{"name": "all"}
HTTP 422
[Asserts]
jsonpath "$.code" == "group.name_reserved"
