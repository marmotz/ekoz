# Blob download (technical.md §6). Authenticated (allow-all baseline until the
# identity AuthGuard lands). server-core registers no access policy, so every
# blob id is 404 — the same answer whether the blob is absent or forbidden.
GET {{base_url}}/blobs/01JQZZZZZZZZZZZZZZZZZZZZZZ
HTTP 404
[Asserts]
header "Content-Type" contains "problem+json"
jsonpath "$.code" == "storage.blob_not_found"
jsonpath "$.status" == 404
