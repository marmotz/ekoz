# Registration in invite mode without a valid invitation (technical.md §8, #15).
#
# `registration.mode = invite` (the fresh-server default) and no / expired /
# already-consumed / email-mismatched invitation token → 422
# "identity.invitation_invalid". Passes as-is on a fresh server.
POST {{base_url}}/auth/register
{
  "name": "mallory",
  "email": "mallory@ekoz.localhost",
  "password": "correct-horse-battery-staple",
  "displayName": "Mallory"
}
HTTP 422
[Asserts]
jsonpath "$.code" == "identity.invitation_invalid"
