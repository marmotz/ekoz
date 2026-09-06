# server — observability module (logs, metrics, traces)

**Status**: done
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#38](https://github.com/ekoz-chat/server/issues/38)

Reference: [../features/server-core/technical.md §11](../features/server-core/technical.md#11-observability-and-instrumentation)
and [ADR 0020](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0020-observability-and-instrumentation.md).

Ships the **emission** side of observability: structured logs, metrics, traces,
health wiring. Operator-facing supervision screens are out of scope (they belong
to `server-administration` and only consume what this task exposes).

## To do

1. `observability/` core module: a `pino` logger factory used as the Nest logger.
   Level from `observability.log_level`, format from `observability.log_format`
   (`pretty` = an in-house one-line `pino` renderer, dev only; `json` otherwise).
2. `redact` path list on the logger covering at least
   `req.headers.authorization`, `req.headers.cookie`, `password`, `token`,
   `*.privateKey`, `email.smtp.pass`, `secret*`. Message bodies and email
   contents are never passed to the logger.
3. Per-request log line via a Nest interceptor: method, matched route, status,
   duration ms, `requestId` (from the `AsyncLocalStorage` context), `userId` when
   authenticated. Background jobs log with a generated `jobId`. Exclude
   `/healthz`, `/readyz`, `/metrics` from this access log.
4. OpenTelemetry bootstrap (`@opentelemetry/sdk-node`): metrics with the
   Prometheus exporter; tracing exporter created only when
   `observability.otlp_endpoint` is set, head-based sampling from
   `observability.trace_sample_ratio` (default `0`). Spans for HTTP handlers,
   Prisma queries, outbound SMTP.
5. `MetricsService`: thin wrapper over OTel counter/histogram/gauge creation.
6. `GET /metrics` (Prometheus text format), **disabled unless**
   `observability.metrics_enabled`. When `observability.metrics_token` is set the
   route requires `Authorization: Bearer <token>`; when unset it is served only
   on the loopback / private bind.
7. Baseline instruments registered by server-core:
   - process: RSS, heap used, event-loop lag, GC pause, open FDs, uptime
   - HTTP: `http_server_requests_total{route,status_class}`,
     `http_server_request_duration_seconds` histogram
   - database: Prisma pool size / in-use / wait time, query duration histogram
   - email: `email_queue_depth`, `email_send_attempts_total`,
     `email_send_failures_total`
   - blob storage: `blob_bytes_total`, `blob_count`, `blob_dedup_ratio`
8. Add the `observability.*` keys to the config registry (ADR 0009 typing):
   `log_level` (runtime), `log_format` (infra), `metrics_enabled` (runtime),
   `metrics_token` (infra, secret), `otlp_endpoint` (infra),
   `trace_sample_ratio` (runtime).
9. Domain metrics for SSE, the event bus, jobs and federation are **not** in
   scope: each is added by the feature that introduces the subsystem, following
   the names reserved in technical.md §11. This task provides only
   `MetricsService` and the registry they plug into.

## Tests

- Logger redaction: a log call carrying a fake `authorization` header / a
  `password` field emits the line with those values replaced.
- `/metrics` returns `404`/`503` when disabled, `200` Prometheus text when
  enabled, `401` without the bearer token when a token is configured.
- The per-request interceptor emits exactly one line per request and none for
  `/healthz`, `/readyz`, `/metrics`.
- Baseline HTTP metrics increment across a sample request.
- Tracing SDK starts with no exporter when `observability.otlp_endpoint` is
  unset and does not throw.

## Dependencies

- [3-http-conventions](3-http-conventions.md)
- [4-config-system](4-config-system.md)
