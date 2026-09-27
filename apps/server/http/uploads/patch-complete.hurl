# Send the whole declared length in one PATCH — tus core (technical.md §S4).
# Finalizes synchronously: sniffed, filtered, ingested, retained. Set
# `access_token` and `upload_id` from `create.hurl` (11-byte upload).
PATCH {{base_url}}/uploads/{{upload_id}}
Authorization: Bearer {{access_token}}
Content-Type: application/offset+octet-stream
Upload-Offset: 0
```
hello world
```
HTTP 200
[Asserts]
header "Tus-Resumable" == "1.0.0"
header "Upload-Offset" == "11"
header "Ekoz-Upload" exists
jsonpath "$.state" == "ready"
