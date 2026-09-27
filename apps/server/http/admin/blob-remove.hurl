# Force-remove a blob from every attachment, link preview and avatar
# referencing it, audited (technical.md §S11, issue #146). Destructive — set
# `access_token` to an owner and `blob_id` to a throwaway blob (e.g. from
# `message_attachment.blob_id` after send-attachments.hurl).
DELETE {{base_url}}/admin/blobs/{{blob_id}}
Authorization: Bearer {{access_token}}
HTTP 204
