# Leave a room — happy path (technical.md §9, issue #4). Set `access_token`
# to a member's token and `room_id` to a room they belong to.
POST {{base_url}}/rooms/{{room_id}}/leave
Authorization: Bearer {{access_token}}
HTTP 204
