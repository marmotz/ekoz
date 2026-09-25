# A `limit` below 1 → 422 validation error.
# Set `access_token`.
GET {{base_url}}/me/mentions?limit=0
Authorization: Bearer {{access_token}}
HTTP 422
