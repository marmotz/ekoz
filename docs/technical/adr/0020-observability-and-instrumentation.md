# 0020 — Observability and instrumentation

**Status**: accepted

## Context

Ekoz targets operators with very varied skills, from a home server to a public instance. When something goes wrong (a
slow endpoint, a leaking SSE connection, a stuck email queue, a growing event-log lag) the operator needs to see it
without attaching a debugger or reading raw application logs line by line.

Observability is cross-cutting: the format of logs, the presence of a
`requestId`, the way handlers are instrumented all have to be decided before the functional features are written.
Retrofitting consistent logging and metrics across an existing codebase is expensive and always partial.

Two concerns are often conflated and must be separated:

- **Emitting** telemetry: structured logs, metrics, traces, health — a server-core responsibility, needed from the
  skeleton on.
- **Presenting** it to the operator: the supervision screens (users and activity, storage usage, server health,
  federation state) — a
  [server administration](https://github.com/ekoz-chat/spec/blob/main/backlog/features/server-administration/overview.md)
  responsibility, later. That feature consumes what this ADR produces; it does not define new telemetry.

Constraints: single process in the first increment (see
[ADR 0005](0005-realtime-transport.md)), Bun runtime (see
[ADR 0002](0002-server-stack.md)), dependencies kept minimal, nothing that phones home by default.

## Decision

### Structured logging

- **JSON logs on stdout**, one object per line, via `pino`. No file rotation, no log shipper in-process: the operator's
  platform (systemd, Docker, k8s)
  owns collection.
- A single logger configured once. Level from config (`observability.log_level`, `runtime`, default `info`).
- Every log line carries `requestId` when emitted within a request, taken from the `AsyncLocalStorage` request context
  (see
  [ADR 0017](0017-api-conventions.md)). Background jobs use a generated
  `jobId`.
- One automatic line per completed HTTP request (method, route, status, duration, `requestId`, `userId` when
  authenticated). Domain events are logged explicitly by the feature that owns them.
- **Never logged**: passwords, tokens, `Authorization` headers, private keys, SMTP credentials, full email bodies,
  message content. A redaction list is configured on the logger; new secret-bearing fields are added to it as they
  appear.

### Metrics

- **Prometheus exposition** at `GET /metrics`, disabled by default, enabled by
  `observability.metrics_enabled` (`runtime`). When enabled without
  `observability.metrics_token`, the route is bound to a private interface only; with a token set it may be exposed and
  requires `Authorization: Bearer`.
- Built on the **OpenTelemetry** metrics SDK with the Prometheus exporter, so the same instrumentation can later push
  OTLP without rewriting call sites.
- Baseline metrics:
    - process: RSS, heap, event-loop lag, GC pauses, open file descriptors, uptime
    - HTTP: request count and duration histogram by route and status class
    - database: Prisma pool size, in-use connections, wait time, query duration
    - outbound email: queue depth, attempts, failures
    - blob storage: total bytes, blob count, deduplication ratio
- **Ekoz-specific metrics** (the ones that matter given the SSE + event-log architecture), added by the feature that
  introduces each subsystem:
    - `ekoz_sse_connections` (gauge, current live streams; also per-account percentiles), connection open/close
      counters, reconnection counter, fan-out dropped-message counter
    - `ekoz_room_event_lag` — delay between a `room_event` write and its materialisation into the derived tables
    - internal event-bus publish/consume counters and lag
    - background-job run count, duration, failure count
    - federation (later): peer reachability, outbound-queue depth, delivery latency

### Traces

- OpenTelemetry tracing, **exporter off by default**. When
  `observability.otlp_endpoint` (`infra`) is set, spans for HTTP handlers, DB queries and outbound calls are exported
  over OTLP. No sampling config beyond head-based ratio (`observability.trace_sample_ratio`, default `0`).

### Health

- Unchanged from [server core](https://github.com/ekoz-chat/spec/blob/main/backlog/features/server-core/technical.md):
  `GET /healthz` (liveness, no dependencies) and `GET /readyz` (DB, migrations, signing key, storage driver; `503` +
  per-check breakdown on failure).
- `/metrics`, `/healthz`, `/readyz` are excluded from the per-request access log to avoid drowning it in scrape noise.

### Configuration surface (added to the registry, [ADR 0009](0009-configuration-model.md))

| key                                | kind          | default                         |
|------------------------------------|---------------|---------------------------------|
| `observability.log_level`          | runtime       | `info`                          |
| `observability.log_format`         | infra         | `json` (`pretty` for local dev) |
| `observability.metrics_enabled`    | runtime       | `false`                         |
| `observability.metrics_token`      | infra, secret | unset                           |
| `observability.otlp_endpoint`      | infra         | unset                           |
| `observability.trace_sample_ratio` | runtime       | `0`                             |

## Consequences

- `server-core` adds a small `observability/` module (logger factory, metrics registry, OTel bootstrap, `/metrics`
  controller) and the config keys above. Dependencies added: `pino`, `@opentelemetry/sdk-node` and the Prometheus
  exporter.
- Every feature that adds a subsystem (SSE, event bus, federation, jobs) is responsible for its own domain metrics and
  domain log events; this ADR is the contract for how.
- `server-administration` builds its supervision screens on `/metrics`,
  `/readyz` and the `audit_log`; it introduces no new telemetry pipeline.
- No telemetry leaves the process unless the operator sets an OTLP endpoint or scrapes `/metrics`. Nothing phones home.
- The in-process email/job queues expose depth and failure metrics now, which makes the later move to an external broker
  observable rather than a black box.

## Alternatives considered

| Point              | Retained                                | Rejected                       | Why                                                                                       |
|--------------------|-----------------------------------------|--------------------------------|-------------------------------------------------------------------------------------------|
| Log transport      | JSON on stdout, platform collects       | in-process shipper to Loki/ELK | Keeps the process single-purpose; every host platform already collects stdout             |
| Metrics stack      | OpenTelemetry SDK + Prometheus exporter | `prom-client` directly         | OTel lets traces and OTLP push be added later without touching instrumentation call sites |
| `/metrics` default | disabled                                | always on                      | Avoids exposing internal metrics on a public bind by accident                             |
| Tracing default    | exporter off                            | always sample                  | Zero cost and zero dependency footprint until an operator opts in                         |
| Log library        | `pino`                                  | `winston`, Nest default logger | Fast, low overhead, first-class redaction, JSON-native                                    |
