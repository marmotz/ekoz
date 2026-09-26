# Public messages policy (backlog `web-client-composer-formatting`, technical.md S1).
# Longest accepted message body, read live from the settings. Passes as-is on any server.
GET {{base_url}}/messages/policy
HTTP 200
[Asserts]
jsonpath "$.bodyMaxLength" isInteger
header "Cache-Control" == "no-store"
