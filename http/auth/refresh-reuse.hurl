# Replaying an already-consumed refresh token (technical.md §7, ADR 0008) →
# reuse detected: the whole session is revoked and an audit entry written, 401
# "auth.refresh_reuse".
#
# To reproduce: log in, run auth/refresh.hurl once (consumes `refresh_token`),
# then run this with that same now-consumed token — set `refresh_token` back to
# the value you just used.
POST {{base_url}}/auth/refresh
{
  "refreshToken": "{{refresh_token}}"
}
HTTP 401
[Asserts]
jsonpath "$.code" == "auth.refresh_reuse"
