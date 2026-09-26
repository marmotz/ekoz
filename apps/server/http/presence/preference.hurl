# Persist the manual "appear away" preference (presence and typing S4). Set
# `access_token`. Restores the default at the end.
PUT {{base_url}}/presence/preference
Authorization: Bearer {{access_token}}
{ "manualAway": true }
HTTP 200
[Asserts]
jsonpath "$.manualAway" == true
jsonpath "$.status" isString

PUT {{base_url}}/presence/preference
Authorization: Bearer {{access_token}}
{ "manualAway": false }
HTTP 200
[Asserts]
jsonpath "$.manualAway" == false
