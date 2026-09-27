# Refuses to set an infra parameter (technical.md §2, issue #145). Set
# `access_token` to an owner.
PUT {{base_url}}/admin/settings/server.domain
Authorization: Bearer {{access_token}}
{
  "value": "other.example.com"
}
HTTP 409
[Asserts]
jsonpath "$.code" == "config.not_runtime"
