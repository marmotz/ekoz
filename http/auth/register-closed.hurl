# Registration while `registration.mode = admin` (technical.md §8, issue #15) →
# 403 "identity.registration_closed". Self-service is off; the owner creates
# accounts via POST /admin/users instead.
#
# Needs the server in `admin` mode. Flip it (runtime, hot-reloadable) with an
# admin API once it exists, or:
#   EKOZ_REGISTRATION__MODE=admin bun run start:dev
POST {{base_url}}/auth/register
{
  "name": "nobody",
  "email": "nobody@ekoz.localhost",
  "password": "correct-horse-battery-staple",
  "displayName": "Nobody"
}
HTTP 403
[Asserts]
jsonpath "$.code" == "identity.registration_closed"
