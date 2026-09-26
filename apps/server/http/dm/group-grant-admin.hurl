# Make a member a group admin — happy path (web-client-direct-messages S4). Group admin
# only; the target must be a member. Set `access_token`, `conversation_id` and
# `target_user_id`.
PUT {{base_url}}/group-dms/{{conversation_id}}/admins/{{target_user_id}}
Authorization: Bearer {{access_token}}
HTTP 204
