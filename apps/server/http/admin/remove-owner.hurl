# Demote an owner (technical.md §15, issue #21). Owner only. At least one owner
# must remain — demoting the last one is 409 "identity.last_owner". 204.
# Set `access_token` to an owner and `target_user_id`.
DELETE {{base_url}}/admin/owners/{{target_user_id}}
Authorization: Bearer {{access_token}}
HTTP 204
