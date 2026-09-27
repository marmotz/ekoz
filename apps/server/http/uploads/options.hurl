# tus capability discovery (technical.md §S4). Public, no body, any state.
OPTIONS {{base_url}}/uploads
HTTP 204
[Asserts]
header "Tus-Resumable" == "1.0.0"
header "Tus-Version" == "1.0.0"
header "Tus-Extension" == "creation,termination,expiration"
header "Tus-Max-Size" exists
