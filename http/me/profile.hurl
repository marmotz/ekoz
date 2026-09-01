# Update the own profile (technical.md §13, issue #19). `bio` is capped at
# `profile.bio_max_length`. Set `access_token`.
PATCH {{base_url}}/me/profile
Authorization: Bearer {{access_token}}
{
  "displayName": "The Owner",
  "bio": "Runs this server."
}
HTTP 200
[Asserts]
jsonpath "$.displayName" == "The Owner"
jsonpath "$.bio" == "Runs this server."
