# Password login — bad credentials (technical.md §11, ADR 0008).
#
# A wrong password and an unknown identifier return the same 401
# "auth.invalid_credentials" (and cost the same Argon2 work). Passes as-is on
# any server.
POST {{base_url}}/auth/login
{
  "identifier": "nobody",
  "password": "wrong-password"
}
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.invalid_credentials"
jsonpath "$.status" == 401
