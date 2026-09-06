# Configuration model

## Context

The operator wants reproducible configuration (Docker, version-controllable) but
also wants to tune everything from the web admin. Rewriting the file from the
admin is fragile (comments lost, file often read-only in a container, concurrent
edits). YAML has too many footguns for a file handled by operators.

## Decision

- **TOML** format. Environment variable interpolation (`${EKOZ_DB_URL}`) and the
  12-factor override `EKOZ_SECTION__KEY`. Secrets are env/file references, never
  inline.
- **Layered configuration, by increasing precedence**:
  `defaults < TOML file < database overrides (admin) < env`.
- Each parameter is typed:
  - `infra`: file / env only (bind address, base URL, storage backend, keys).
    Not editable from the admin.
  - `runtime`: the file provides the default, the admin writes to a `settings`
    table that overrides at runtime (registration mode, quotas, default
    retention, link previews, email verification…).
- The **environment can lock** a `runtime` parameter: the admin then sees the
  effective value but cannot change it. Directly serves the rule "administrative
  restrictions take precedence".
- The admin **never** writes to the file.
- The admin UI shows, per parameter: effective value, source, any lock, and
  "restart required" where applicable.

## Consequences

- A GitOps deployment drives the baseline through the file; the admin adjusts the
  rest without touching disk.
- A central registry of parameters is needed (key, `infra`/`runtime` type,
  default, hot-applicable or not).
