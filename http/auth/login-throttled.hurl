# Credential-endpoint throttle (technical.md §14, issue #22). Replay this
# several times fast with the same bad identifier: past `auth.sensitive_throttle`
# `max` within the window the guard answers 429 with a `Retry-After` header.
# A single run is a normal 401.
POST {{base_url}}/auth/login
{
  "identifier": "throttle-probe",
  "password": "wrong"
}
HTTP 401
