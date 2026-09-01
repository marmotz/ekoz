# Lift a suspension (technical.md §15, issue #21, owner only): status back to
# `active`. Set `access_token` to an owner and `target_user_id`.
POST {{base_url}}/admin/users/{{target_user_id}}/unsuspend
Authorization: Bearer {{access_token}}
HTTP 204
