# Refuses an invalid value for the target parameter (technical.md §2, issue
# #145). Set `access_token` to an owner.
PUT {{base_url}}/admin/settings/messages.max_page
Authorization: Bearer {{access_token}}
{
  "value": "not-a-number"
}
HTTP 422
[Asserts]
jsonpath "$.code" == "config.invalid_value"
