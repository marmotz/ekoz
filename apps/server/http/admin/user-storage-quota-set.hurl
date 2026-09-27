# Override a user's storage quota, audited (technical.md §S11, issue #146).
# Set `access_token` to an owner and `target_user_id`. Restore with
# user-storage-quota-reset.hurl.
PUT {{base_url}}/admin/users/{{target_user_id}}/storage-quota
Authorization: Bearer {{access_token}}
{
  "quotaBytes": "104857600"
}
HTTP 204
