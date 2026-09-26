# Public messages policy (backlog `web-client-composer-formatting`, technical.md S1).
# Longest accepted message body and own-message edit window (seconds, null = unlimited), read live from the settings. Passes as-is on any server.
GET {{base_url}}/messages/policy
HTTP 200
[Asserts]
jsonpath "$.bodyMaxLength" isInteger
jsonpath "$.editWindow" exists
header "Cache-Control" == "no-store"
