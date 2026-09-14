# Room detail on a private room as a non-member (technical.md §6, issue #1;
# `Membership` does not exist yet, see docs/technical/permission-model.md and
# backlog/features/conversations/technical.md §6 — a private room denies
# anyone but the owner until issue #4 lands) → 403 "room.permission_denied".
# Set `access_token` to a non-owner account's token and `room_id` to a
# `visibility: "private"` room.
GET {{base_url}}/rooms/{{room_id}}
Authorization: Bearer {{access_token}}
HTTP 403
[Asserts]
jsonpath "$.code" == "room.permission_denied"
