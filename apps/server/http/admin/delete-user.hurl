# Delete an account as an owner (technical.md §15, issue #21). Same scrub as
# `DELETE /me`. The last owner cannot be deleted. 204.
#
# Destructive: use a throwaway `target_user_id`. Set `access_token` to an owner.
DELETE {{base_url}}/admin/users/{{target_user_id}}
Authorization: Bearer {{access_token}}
HTTP 204
