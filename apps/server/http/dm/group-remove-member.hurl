# Remove a member from a group conversation — happy path (web-client-direct-messages S4).
# Group admin only; removing oneself is leaving. The group is deleted when no admin
# remains. Set `access_token`, `conversation_id` and `target_user_id`.
DELETE {{base_url}}/group-dms/{{conversation_id}}/members/{{target_user_id}}
Authorization: Bearer {{access_token}}
HTTP 204
