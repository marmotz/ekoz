# First-owner setup — bad pinning (technical.md §1, ADR 0010, issue #18).
#
# Setup is still open (no owner) but the token is wrong (or, on an email-pinned
# boot, the email is not the pinned one) → 403 "identity.setup_rejected".
# Passes on a fresh token-pinned server; the literal token below is never valid.
POST {{base_url}}/setup/owner
{
  "token": "not-a-real-setup-token",
  "email": "owner@ekoz.localhost",
  "password": "correct-horse-battery-staple",
  "name": "owner",
  "displayName": "The Owner"
}
HTTP 403
[Asserts]
jsonpath "$.code" == "identity.setup_rejected"
