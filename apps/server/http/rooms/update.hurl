# Update a room's name / topic / visibility / read-only — happy path
# (technical.md §5, issue #1). Needs `space.manage`. Set `access_token` to an
# owner's token and `room_id`.
PATCH {{base_url}}/rooms/{{room_id}}
Authorization: Bearer {{access_token}}
{
  "name": "Renamed",
  "readOnly": true
}
HTTP 200
[Asserts]
jsonpath "$.name" == "Renamed"
jsonpath "$.readOnly" == true
