# Readiness: database, migrations, signing key, storage. 200 when all pass,
# 503 + the failing checks otherwise. Accept both, assert the breakdown shape.
GET {{base_url}}/readyz
HTTP *
[Asserts]
jsonpath "$.status" matches /^(ready|not_ready)$/
jsonpath "$.checks.database.ok" exists
jsonpath "$.checks.migrations.ok" exists
jsonpath "$.checks.signing_key.ok" exists
jsonpath "$.checks.storage.ok" exists
