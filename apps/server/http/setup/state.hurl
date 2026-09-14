# Public setup-state probe (technical.md §2.4, issue #15). Never 410s, unlike
# the rest of `/setup/*` — the console needs it to decide setup vs login
# before anyone signs in. Passes as-is on any server.
GET {{base_url}}/setup
HTTP 200
[Asserts]
jsonpath "$.state" matches /^(closed|email-pinned|token-pinned)$/
header "Cache-Control" == "no-store"
