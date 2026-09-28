# Admin settings API

## Context

[Configuration model](configuration-model.md) established the layered
resolver — `code defaults < TOML file < settings table < environment`, with an
env override on a `runtime` key also locking it — and the `ConfigService.set` /
`clear` / `describe` primitives plus the `settings` table to back runtime
overrides. That page also records the finding that drove this one: server
administration originally **excluded** exposing this over HTTP at all — there
was a resolver and a table, but no route. The content-and-sharing feature
needed an admin screen for `uploads.*`, `storage.capacity_bytes`,
`link_previews.*` and `files.url_ttl` (see the [content and sharing technical
design](../../backlog/features/content-and-sharing/technical.md), §S11),
which is what finally required building the HTTP surface. This page documents
that surface — the resolution layering itself stays in
[configuration model](configuration-model.md), not duplicated here.

## Decision

**A single generic API**, not one endpoint per feature's settings screen:
`SettingsController` under `/admin/settings`
([settings.controller.ts](../../apps/server/src/core/config/settings.controller.ts)),
`AuthGuard` + `OwnerGuard` — server owner only, the same as every other
`/admin/*` route (see [permission model](permission-model.md), the `owner`
role is server-level, implicit allow-all).

- `GET /admin/settings` → every registered parameter's `describe()`: key,
  `kind` (`infra` | `runtime`), resolved `value`, `source`
  (`default | file | settings | env`), whether it is `locked` (an env override
  on a `runtime` key — the admin can see the effective value but not change
  it), `hotReloadable`, and a JSON-schema hint derived from the Zod schema
  (`z.toJSONSchema(spec.schema)`, best-effort — a schema that cannot be
  converted just yields `null` rather than failing the whole response). One
  registry, one response shape, reused by every feature's settings screen —
  the sharing admin screen (`apps/admin`) renders only the sharing-prefixed
  keys client-side; the API itself does not know about "screens".
- `PUT /admin/settings/:key { value }` → writes a runtime override. Rejected
  with `409 config.not_runtime` for an `infra` key (those are file/env only by
  design — bind address, storage backend, secret keys) and `409 config.locked`
  when an env override already pins the key. The value is validated against
  the parameter's own Zod schema before being persisted — the same schema
  `ConfigService.get` uses to coerce it back on read, so a value that passes
  this endpoint is guaranteed to parse later.
- `DELETE /admin/settings/:key` → clears the runtime override, reverting to
  whatever the file or code default resolves to. Same `409` guards as `PUT`.
- **Secrets are never round-tripped.** A parameter marked `secret: true`
  (`ConfigService.describe`) reports `value: "[secret]"` (`SECRET_MASK`)
  instead of its real value — the admin UI can show that a secret is set and
  where it comes from, never what it is.

### Audit trail

Every `PUT` and `DELETE` that actually changes a key is recorded through
`AuditService.record` as `config.setting_changed`
(`targetType: "config"`, `targetId: <key>`, `metadata: { oldValue, newValue }`
— both already secret-masked by `describe()` before being read into the audit
metadata, so a secret's value never lands in the audit log either). The
before/after snapshot is taken with `describe()` on both sides of the change,
not just the raw input, so the audit entry reflects the actually-resolved
value (including re-derived `source`/`locked`), not merely what the caller
asked to set.

### Hot-reload TTL

`ConfigService` caches the `settings` table's rows in memory and only re-reads
them at most every `HOT_RELOAD_TTL_MS` (5 seconds,
[config.service.ts](../../apps/server/src/core/config/config.service.ts)). A
`PUT`/`DELETE` through this API forces an immediate `refreshSettings(true)`,
so the caller that just changed a setting sees it applied at once. Every
*other* already-running request/process instead picks the change up within 5
seconds: `get()` calls `maybeExpireSettings()`, which fires a fire-and-forget
refresh once the cache is stale and serves the still-cached value for that one
call while the refresh is in flight — deliberately not blocking every `get()`
on a network round trip to keep hot paths (permission checks, quota checks)
fast. `invalidate()` exists for tests that need to force the next `get()` to
re-read synchronously.

### Why runtime-mutable settings exist at all

Some parameters (registration mode, default quota, upload filters, link
previews, retention defaults, `files.url_ttl`, …) are the kind of thing an
operator plausibly wants to tune after a security incident, a usage spike, or
simply while trying out a feature — waiting on a redeploy for every such
change is real operational friction, especially since the project's stated
goal is staying deployable with few operational dependencies (favoring an
admin-editable knob over "edit the file, redeploy" for these). The layering
still lets a GitOps-style deployment pin a value non-negotiably from the file
or environment (an `infra` key, or an env override that locks a `runtime`
key) when that is what's wanted instead — this API only ever adds an override
on top of the file's own baseline; it never writes to the file itself.

## Alternatives considered

- **One bespoke endpoint per settings screen** (e.g. `/admin/sharing-settings`,
  `/admin/retention-settings`). Rejected: it would duplicate the same
  validate/lock/audit logic per feature, and any new admin-editable parameter
  would need a new route instead of just a new `PARAMETER_REGISTRY` entry.
- **Editing the settings table directly** (no HTTP layer, only ops tooling).
  Rejected outright: it was the status quo this feature replaced, and it gives
  no audit trail, no schema validation, and no lock enforcement.
- **Immediate synchronous propagation to every process** (e.g. pub/sub
  invalidation) instead of a TTL. Rejected as more machinery than the problem
  needs: a 5-second worst-case staleness on a config value is acceptable for
  every parameter currently marked `hotReloadable`, and it needs no extra
  infrastructure (no pub/sub channel, no extra dependency) — consistent with
  the project favoring an architecture with few moving parts.

## Consequences

- Adding a new admin-editable setting is a `PARAMETER_REGISTRY` entry plus its
  UI field — no new controller code.
- `GET /admin/settings` returns the *entire* registry, `infra` keys included
  (read-only, `locked` reflecting only `runtime` keys); the admin UI decides
  which subset to render for a given screen, so the same response already
  contains everything a future screen might need.
- A value written through this API is immediately valid for the writer's own
  next request, but other server processes (were the server ever to run more
  than one instance — see the single-instance note in
  [resumable uploads](resumable-uploads.md#operator-notes)) or other in-flight
  requests can observe it up to `HOT_RELOAD_TTL_MS` late; nothing in the
  current parameter set is sensitive enough to require stronger consistency
  than that.
- Every setting change is attributable and reversible in principle (the audit
  log carries old and new value), but the audit log itself is not a config
  history UI — reconstructing "what was set when" today means reading audit
  entries, not a dedicated version view.
