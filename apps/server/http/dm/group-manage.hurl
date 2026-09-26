# Rename a group conversation — happy path (web-client-direct-messages S4). Needs the
# group admin override (`room.manage_members`). `"name": null` clears the name. Set
# `access_token` and `conversation_id` to a `group_dm`.
PATCH {{base_url}}/group-dms/{{conversation_id}}
Authorization: Bearer {{access_token}}
{
  "name": "Weekend plans"
}
HTTP 200
[Asserts]
jsonpath "$.id" == "{{conversation_id}}"
jsonpath "$.type" == "group_dm"
jsonpath "$.name" == "Weekend plans"
