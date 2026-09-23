# Boot configuration summary

## Context

The layered configuration (see [Configuration model](configuration-model.md))
resolves each parameter from the code default, `config.toml`, the settings
table or the environment. When something misbehaves (mail not delivered, wrong
database, wrong storage backend), the operator needs to know which value the
process actually resolved, and from where, without attaching a debugger or
opening the admin console.

## Decision

- Right after the logger is reconfigured, `main.ts` logs the whole resolved
  configuration (`buildConfigSummary`, `core/config/config-summary.ts`), one
  `info` line per top-level section, under the `Config` context:
  `[email] driver=smtp smtp.host=mail.example.com (env) smtp.port=587 (file) …`.
- A value that does not come from the code default is suffixed with its source
  (`file`, `settings`, `env`).
- Secrets are never printed: a set secret shows `[secret]`, an unset one
  `<unset>` (knowing whether credentials are configured is useful and reveals
  nothing). A registry entry may opt into `redactAs: 'url'`: the value is shown
  as a URL with its password replaced by `***` and its query string dropped
  (used for `database.url`, so the target host / database stay visible).
- A runtime override that fails validation is reported as `<invalid: …>`
  instead of aborting the boot (infra keys are already validated by
  `ConfigService.init()`).
- `secret` in the registry now means *credential*, not *infrastructure detail*:
  `email.smtp.host` / `port` / `secure` and `storage.s3.endpoint` / `region` /
  `bucket` are no longer secret, so they appear in the summary and unmasked in
  the admin UI. SMTP / S3 credentials, `database.url`, `secret.key` and
  `observability.metrics_token` stay secret.

## Alternatives

- **Hand-picked list of keys** — shorter output, but every new parameter has to
  be added by hand and the one being debugged is always the missing one. The
  full registry is about twenty lines.
- **One structured log record with the whole config as a field** — convenient
  in JSON, unreadable with `log_format = "pretty"`. One line per section reads
  well in both formats.
- **Debug level only** — the summary is most needed exactly when the operator
  did not think of raising the log level.

## Consequences

- Every new registry parameter shows up in the boot log automatically; marking
  it `secret: true` is what keeps its value out of it.
- Values of non-secret parameters must not embed credentials (e.g. a URL with
  a password belongs in a `secret` parameter, with `redactAs: 'url'` if its host
  is worth showing).
