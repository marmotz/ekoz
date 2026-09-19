# Invite a user to a room — happy path (technical.md §9, issue #4). Needs
# `room.invite`. Set `access_token` to a privileged member's token, `room_id`
# and `target_user_id` (the invitee).
POST {{base_url}}/rooms/{{room_id}}/invitations
Authorization: Bearer {{access_token}}
{
  "userId": "{{target_user_id}}",
  "role": "member"
}
HTTP 201
[Asserts]
jsonpath "$.roomId" == "{{room_id}}"
jsonpath "$.userId" == "{{target_user_id}}"
