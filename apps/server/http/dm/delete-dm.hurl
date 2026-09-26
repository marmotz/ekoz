# Delete a one-to-one conversation for the caller — happy path (web-client-direct-messages S1).
# `POST /rooms/:id/leave` on a `dm` hides it and raises the caller's history floor: it
# comes back with only the messages written afterwards. Set `access_token` and
# `conversation_id` to a `dm` the caller belongs to.
POST {{base_url}}/rooms/{{conversation_id}}/leave
Authorization: Bearer {{access_token}}
HTTP 204
