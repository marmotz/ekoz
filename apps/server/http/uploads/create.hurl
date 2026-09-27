# Create a resumable upload — tus creation extension (technical.md §S4).
# `Upload-Length` is the whole file's declared size; `Upload-Metadata` carries
# `filename` (required, base64) and `type` (informational). Quota-checked
# before any byte is accepted. Set `access_token`; captures `upload_id` from
# `Location` for `patch.hurl` / `head.hurl` / `get.hurl` / `cancel.hurl`.
POST {{base_url}}/uploads
Authorization: Bearer {{access_token}}
Upload-Length: 11
Upload-Metadata: filename aGVsbG8udHh0
HTTP 201
[Captures]
upload_id: header "Location" regex "/uploads/(.+)"
[Asserts]
header "Tus-Resumable" == "1.0.0"
header "Location" matches "^/uploads/"
header "Upload-Expires" exists
