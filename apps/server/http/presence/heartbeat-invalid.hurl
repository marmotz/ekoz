# Presence heartbeat with an empty `clientId` → 422. Set `access_token`.
POST {{base_url}}/presence/heartbeat
Authorization: Bearer {{access_token}}
{ "clientId": "" }
HTTP 422
