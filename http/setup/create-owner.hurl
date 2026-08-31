# First-owner setup (technical.md §5, ADR 0010).
#
# server-core (#8) ships the state machine, the SetupGuard and the single-use
# token. `POST /setup/owner` itself lives in identity (#18) and is NOT wired yet,
# so this is currently 404. When #18 lands, replace the body below with the real
# flow and add setup/already-closed.hurl for the 410 case.
#
# token-pinned (no EKOZ_INITIAL_OWNER_EMAIL): a fresh token is printed at WARN on
# every boot until an owner exists. Grab it from the logs:
#   bun run start:dev 2>&1 | grep -A2 'single-use token'
# and put it in ../vars.env (setup_token) or pass --variable setup_token=...
POST {{base_url}}/setup/owner
{
  "token": "{{setup_token}}",
  "email": "owner@ekoz.localhost",
  "password": "correct-horse-battery-staple",
  "name": "owner",
  "displayName": "Owner"
}
HTTP 404

# Intended once #18 is merged:
# HTTP 201
# [Asserts]
# jsonpath "$.user.isOwner" == true
# [Captures]
# access_token: jsonpath "$.session.accessToken"
