# Revert a user's quota to the server default (technical.md §S11, issue
# #146). Run after user-storage-quota-set.hurl. Set `access_token` to an
# owner and `target_user_id`.
DELETE {{base_url}}/admin/users/{{target_user_id}}/storage-quota
Authorization: Bearer {{access_token}}
HTTP 204
