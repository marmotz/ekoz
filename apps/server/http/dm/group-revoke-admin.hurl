# Revoke a group admin — happy path (web-client-direct-messages S4). Group admin only.
# Revoking the last admin deletes the group for everyone. Set `access_token`,
# `conversation_id` and `target_user_id`.
DELETE {{base_url}}/group-dms/{{conversation_id}}/admins/{{target_user_id}}
Authorization: Bearer {{access_token}}
HTTP 204
