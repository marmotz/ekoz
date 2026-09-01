# Suspend an account (technical.md §15, issue #21, owner only): status
# `suspended`, every session revoked, audit. The last owner cannot be suspended.
# Set `access_token` to an owner and `target_user_id`.
POST {{base_url}}/admin/users/{{target_user_id}}/suspend
Authorization: Bearer {{access_token}}
{
  "reason": "Terms of service violation"
}
HTTP 204
