# Prometheus scrape endpoint (technical.md §11, ADR 0020).
#
# The local-dev config.toml ships `observability.metrics_enabled = false`, so the
# route is 404 by default. To see the enabled path, restart with:
#   EKOZ_OBSERVABILITY__METRICS_ENABLED=true bun run start:dev
# then it answers 200 `text/plain` with `http_server_requests_total` etc.
# (served only on a loopback / private bind unless `observability.metrics_token`
# is set). Flip the expected status below when testing that.
GET {{base_url}}/metrics
HTTP 404
[Asserts]
jsonpath "$.code" == "not_found"
