# Registration with a password that fails the minimal policy (technical.md §8,
# issue #15): shorter than 10 characters, or in the small common-password
# denylist → 422 "identity.password_too_weak".
#
# The policy is checked before the invitation, so this passes as-is on a fresh
# invite-mode server.
POST {{base_url}}/auth/register
{
  "name": "weakling",
  "email": "weak@ekoz.localhost",
  "password": "short",
  "displayName": "Weak"
}
HTTP 422
[Asserts]
jsonpath "$.code" == "identity.password_too_weak"
