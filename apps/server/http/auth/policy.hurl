# Public authentication policy (backlog `auth` feature, technical.md S1).
# Registration mode, verification requirement and minimum password length,
# read live from the settings. Passes as-is on any server.
GET {{base_url}}/auth/policy
HTTP 200
[Asserts]
jsonpath "$.registrationMode" matches /^(open|invite|admin)$/
jsonpath "$.emailVerificationRequired" isBoolean
jsonpath "$.passwordMinLength" isInteger
jsonpath "$.linkPreviews" isBoolean
header "Cache-Control" == "no-store"
