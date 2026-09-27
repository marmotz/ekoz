# Set a runtime override — happy path (technical.md §2, issue #145). Set
# `access_token` to an owner. Restore with settings-reset.hurl when done.
PUT {{base_url}}/admin/settings/messages.max_page
Authorization: Bearer {{access_token}}
{
  "value": 75
}
HTTP 200
[Asserts]
jsonpath "$.key" == "messages.max_page"
jsonpath "$.value" == 75
jsonpath "$.source" == "settings"
