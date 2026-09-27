# Declaring more than `uploads.max_file_bytes` is refused before any byte is
# accepted (technical.md §S8). Set `access_token`.
POST {{base_url}}/uploads
Authorization: Bearer {{access_token}}
Upload-Length: 999999999999
Upload-Metadata: filename aHVnZS5iaW4=
HTTP 413
[Asserts]
jsonpath "$.code" == "upload.too_large"
