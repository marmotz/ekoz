# Soft-delete an empty room — happy path (technical.md §5, issue #1). Needs
# `space.manage`. Set `access_token` to an owner's token and `room_id` to a
# room with no live children.
DELETE {{base_url}}/rooms/{{room_id}}
Authorization: Bearer {{access_token}}
HTTP 204
