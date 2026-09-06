# Server discovery document (technical.md §4, ADR 0006). Unauthenticated,
# cacheable. Consumed by clients and by peer servers.
GET {{base_url}}/.well-known/ekoz
HTTP 200
[Asserts]
header "Cache-Control" contains "max-age=300"
jsonpath "$.server" == "ekoz.localhost"
jsonpath "$.api" == "http://ekoz.localhost:3010"
jsonpath "$.web" == "http://ekoz.localhost:5110"
jsonpath "$.protocol_versions" contains "0"
jsonpath "$.signing_keys" exists
body contains "public_key"
