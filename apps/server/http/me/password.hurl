# Change the authenticated account's password (issue #101).
#
# Re-authenticates with `currentPassword`, applies the registration password
# policy to `newPassword`, then revokes every other session of the account; the
# calling session stays open. 204.
#
# Set `access_token` for the caller. Changes the password: adjust the values,
# and use the new one for later logins.
POST {{base_url}}/me/password
Authorization: Bearer {{access_token}}
{
  "currentPassword": "correct-horse-battery-staple",
  "newPassword": "another-correct-horse-battery-staple"
}
HTTP 204
