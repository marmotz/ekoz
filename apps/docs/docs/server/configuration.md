---
sidebar_position: 2
---

# Configuration

The server is configured with a TOML file, environment variables, and, for some
parameters, the admin console. The annotated reference is
[`apps/server/config.example.toml`](https://github.com/marmotz/ekoz/blob/develop/apps/server/config.example.toml).

## Layers

By increasing precedence:

```text
code defaults < TOML file < settings table (admin console) < environment
```

The file is `./config.toml`, or the path in `EKOZ_CONFIG_FILE`.

## Two kinds of parameter

- **infra**: read from the file and the environment only (bind address, public
  URLs, database, keys, storage backend). Not editable from the admin console.
  A missing or invalid value aborts the boot.
- **runtime**: the file provides the default and an administrator can change it
  live from the admin console (registration mode, quotas, retention, log level,
  and so on). Setting the matching environment variable overrides it and locks it:
  the console then shows the effective value read-only.

The admin console never writes to the file. It shows, for each parameter, its
effective value, its source, any lock and whether a restart is needed.

## Environment variables

Any parameter can be set as `EKOZ_<SECTION>__<KEY>`, with a double underscore for
nesting:

| Parameter                 | Variable                     |
| ------------------------- | ---------------------------- |
| `[http] port`             | `EKOZ_HTTP__PORT`            |
| `[storage.local] path`    | `EKOZ_STORAGE__LOCAL__PATH`  |
| `[email.smtp] host`       | `EKOZ_EMAIL__SMTP__HOST`     |

String values in the file accept `${ENV_VAR}` interpolation, resolved at load time.
An undefined variable aborts the boot. Secrets must be referenced this way, or set
from the environment, never written inline.

## Required parameters

| Parameter       | Meaning                                                            |
| --------------- | ------------------------------------------------------------------ |
| `server.domain` | Public FQDN of the instance. Immutable for the life of a deployment. |
| `server.api_url`| Public base URL of the API, no trailing slash.                      |
| `server.web_url`| Public base URL of the web client, used in outgoing emails.         |
| `database.url`  | PostgreSQL connection string. Usually `${DATABASE_URL}`.            |
| `secret.key`    | 32 bytes, base64. Generate with `openssl rand -base64 32`.          |

## Notable sections

- `[http]`: `host`, `port` (default 3010) and `cors_allowed_origins`. The admin
  console and the web client each run on their own origin: list them here, or CORS
  stays off.
- `[storage]`: `driver` is `local` (`[storage.local] path`) or `s3`
  (`[storage.s3]`: `endpoint`, `region`, `bucket`, `access_key_id`,
  `secret_access_key`, and `force_path_style = true` for MinIO and most
  self-hosted stores). `gc_grace_seconds` delays deletion of unreferenced blobs.
- `[email]` and `[email.smtp]`: sender address and SMTP relay (`host`, `port`,
  `secure`, optional `user` and `pass`). Failed messages are retried with
  exponential backoff, then recorded as failed in the audit log.
- `[registration] mode`: `open`, `invite` (default) or `admin`.
- `[identity] username_change_policy`: `immutable` (default), `available` or
  `approval`.
- `[observability]`: `log_level`, `log_format`, `metrics_enabled`,
  `metrics_token`, `otlp_endpoint`, `trace_sample_ratio`. See
  [operations](operations.md).
- `[signing] key_overlap_seconds`: how long a rotated signing key stays published.
  Default 7 days.

Storage limits (maximum file size, per-user quota, global capacity) and the MIME
allow or block list are runtime settings managed from the admin console.
