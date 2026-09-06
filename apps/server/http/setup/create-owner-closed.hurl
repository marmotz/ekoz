# First-owner setup — already complete (technical.md §5, ADR 0010, issue #18).
#
# Once an owner exists, server-core's SetupGuard makes every /setup/* route
# 410 Gone, permanently — before the body is even looked at. This is the steady
# state of any server past initial setup; it does NOT pass on a fresh database.
POST {{base_url}}/setup/owner
{
  "token": "irrelevant",
  "email": "someone@ekoz.localhost",
  "password": "correct-horse-battery-staple",
  "name": "someone",
  "displayName": "Someone"
}
HTTP 410
[Asserts]
jsonpath "$.code" == "setup.closed"
