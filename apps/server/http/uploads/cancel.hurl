# Cancel an in-progress upload — tus termination extension (technical.md §S4):
# deletes the staging bytes (and releases the blob if already `ready`). Set
# `access_token` and `upload_id` from `create.hurl`.
DELETE {{base_url}}/uploads/{{upload_id}}
Authorization: Bearer {{access_token}}
HTTP 204
