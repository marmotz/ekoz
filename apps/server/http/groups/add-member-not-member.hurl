# Add a user who is not an effective member → 422 "group.member_not_member".
# Set `access_token`, `room_id`, `group_id` and `target_user_id` (not a member).
PUT {{base_url}}/rooms/{{room_id}}/groups/{{group_id}}/members/{{target_user_id}}
Authorization: Bearer {{access_token}}
HTTP 422
[Asserts]
jsonpath "$.code" == "group.member_not_member"
