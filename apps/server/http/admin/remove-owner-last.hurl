# Demoting the only owner (technical.md §15, issue #21) → 409
# "identity.last_owner". Set `access_token` / `target_user_id` to the sole owner.
DELETE {{base_url}}/admin/owners/{{target_user_id}}
Authorization: Bearer {{access_token}}
HTTP 409
[Asserts]
jsonpath "$.code" == "identity.last_owner"
