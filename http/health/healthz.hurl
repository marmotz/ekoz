# Liveness: the process is up, no dependency checks. Always 200 while running.
GET {{base_url}}/healthz
HTTP 200
[Asserts]
jsonpath "$.status" == "ok"
