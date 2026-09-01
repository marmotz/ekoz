# Promote an account to owner (technical.md §15, issue #21). Owner only. 204.
# Set `access_token` to an owner and `target_user_id`.
POST {{base_url}}/admin/owners
Authorization: Bearer {{access_token}}
{
  "userId": "{{target_user_id}}"
}
HTTP 204
