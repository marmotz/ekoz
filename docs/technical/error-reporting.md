# Server error reporting

## Context

The runtime libraries wrap failures in nested, structured error objects (Prisma Next `CliStructuredError` >
`SqlConnectionError` > `AggregateError` > `pg` network errors). With an unreachable database, every module that queries
the database in `onModuleInit` rejects for the same root cause, and Bun printed each rejection as a raw source excerpt
plus stack: about ten near-identical, hundreds-of-lines blocks, with the actual cause (`ECONNREFUSED`) at the bottom
of each one.

The operator needs one answer to "what failed, why, and what do I do".

## Decision

One module, `apps/server/src/core/observability/error-report.ts`, turns any thrown value into a report:

- **Chain flattening**: follows `cause` and `AggregateError.errors`, bounded depth, cycle-safe, duplicates collapsed,
  empty wrapper errors (no message, code, `why` or `fix`) dropped.
- **Structured fields**: Prisma Next `code`, `why` and `fix` are shown as such.
- **Hints**: a few well-known causes (unreachable database, bad credentials, missing database, port in use, schema
  behind the code) get a one-line remedy. Connection strings are never printed, since they carry secrets.
- **Stack**: hidden by default, printed when `OBSERVABILITY_LOG_LEVEL` (or `EKOZ_OBSERVABILITY__LOG_LEVEL`) is `debug`
  or `trace`.

Two consumers:

- **Process boundary** (`main.ts`): boot runs inside `main().catch(reportFatal)`, and `uncaughtException` /
  `unhandledRejection` go through the same reporter. It prints once and exits with status 1, so parallel failures from
  the same root cause produce a single report. `NestFactory.create` runs with `abortOnError: false` so Nest rethrows
  instead of calling `process.abort()`.
- **Request path** (`ProblemExceptionFilter`): a 5xx logs the one-line summary (`headline [CODE] (caused by: ...)`)
  instead of the bare outer message, with the stack still attached. The HTTP response is unchanged: it stays a generic
  `internal_error` problem, details never leave the server.

- **Boot retry** (`waitForDatabase`, `core/prisma/wait-for-database.ts`): before `NestFactory.create`, a probe
  (`connect` + `SELECT 1`) is retried 3 times after 1s, 5s and 10s, each retry logged to stderr, only while the
  failure is a network error. Other failures (credentials, stale schema) fail at once. `NestFactory.create` uses
  `autoFlushLogs: false` so Nest's buffered `ExceptionHandler` error is never printed on a failed boot.

## Alternatives

- **Patch each service** to catch its own database error: repeated in every hook, and misses errors nobody thought of.
- **Add a dependency** (`pretty-error`, `youch`): heavier than the ~150 lines needed, and none knows Prisma Next's
  `why` / `fix` fields.
- **Emit the fatal report as JSON** when `log_format = json`: better for log collectors, but the boot-time logger is not
  configured yet. Deferred; a plain-text stderr report on a crash is acceptable for now.

## Consequences

- A failed boot prints a short, actionable message instead of a wall of stack traces.
- The reporter is generic: new well-known causes are one `inferHint` branch.
- Post-boot unhandled rejections now terminate the process with the readable report, as Node's default already did.
