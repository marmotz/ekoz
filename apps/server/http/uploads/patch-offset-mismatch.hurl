# A wrong Upload-Offset is refused (technical.md §S4). Set `access_token` and
# `upload_id` from `create.hurl` (a fresh one, offset 0 so far).
PATCH {{base_url}}/uploads/{{upload_id}}
Authorization: Bearer {{access_token}}
Content-Type: application/offset+octet-stream
Upload-Offset: 5
```
xx
```
HTTP 409
[Asserts]
jsonpath "$.code" == "upload.offset_mismatch"
