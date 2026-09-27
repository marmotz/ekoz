# A bogus, tampered or expired token reads 404 (technical.md §S6) — same
# answer whichever it is. Public route, no token needed to run this file.
GET {{base_url}}/files/bogus-token
HTTP 404
[Asserts]
jsonpath "$.code" == "files.not_found"
