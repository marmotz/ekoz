# Resumption check — tus core (technical.md §S4). Owner only, no body.
# Set `access_token` and `upload_id` from `create.hurl`.
HEAD {{base_url}}/uploads/{{upload_id}}
Authorization: Bearer {{access_token}}
HTTP 200
[Asserts]
header "Tus-Resumable" == "1.0.0"
header "Upload-Offset" exists
header "Upload-Length" == "11"
