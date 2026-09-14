# Set a per-user capability override on a room — happy path (technical.md §6,
# issue #3). Needs `room.manage_permissions`. Beats a same-node role override.
# Set `access_token` to an owner's token, `room_id`, and `target_user_id`.
PUT {{base_url}}/rooms/{{room_id}}/members/{{target_user_id}}/permissions
Authorization: Bearer {{access_token}}
{
  "capability": "room.pin",
  "effect": "allow"
}
HTTP 204
