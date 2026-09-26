# Add members to a group conversation — happy path (web-client-direct-messages S4). Group
# admin only. `history` is `full` (default) or `none` (the newcomer reads only new
# messages). Set `access_token`, `conversation_id` and `target_user_id` (an active user).
POST {{base_url}}/group-dms/{{conversation_id}}/members
Authorization: Bearer {{access_token}}
{
  "userIds": ["{{target_user_id}}"],
  "history": "none"
}
HTTP 200
[Asserts]
jsonpath "$" isCollection
