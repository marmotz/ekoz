# Set a role-scoped capability override on a room — happy path (technical.md
# §6, issue #3). Needs `room.manage_permissions`. Set `access_token` to an
# owner's token and `room_id`.
PUT {{base_url}}/rooms/{{room_id}}/permissions
Authorization: Bearer {{access_token}}
{
  "role": "member",
  "capability": "room.pin",
  "effect": "allow"
}
HTTP 204
