# server — public setup-state probe and CORS support

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#48](https://github.com/ekoz-chat/server/issues/48)

Reference: [../features/server-administration/technical.md §2.4, §2.5](../features/server-administration/technical.md#24-get-setup-public)
and [ADR 0009](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0009-configuration-model.md).

The admin console runs on its own origin and must decide, before anyone signs
in, whether to show the setup screen or the login screen. Two small pieces of
plumbing: a public setup-state probe and an origin allow-list for CORS.

## Verified findings

- `main.ts` calls no `app.enableCors` — CORS is off everywhere
  ([main.ts](../../src/main.ts)).
- `SetupController` is `@UseGuards(SetupGuard)`
  ([setup.controller.ts](../../src/modules/identity/accounts/setup.controller.ts)),
  so any route under it returns `410 Gone` once an owner exists — a state probe
  cannot live there.
- `SetupService.resolveState()` already returns
  `'closed' | 'email-pinned' | 'token-pinned'`
  ([setup.service.ts:47](../../src/core/bootstrap/setup.service.ts)).
- The config registry partitions `infra` / `runtime` and supports `list: true`
  ([registry.ts](../../src/core/config/registry.ts)); `main.ts` reads bootstrap
  parameters after `app.init()`.
- The global `BaselineAuthGuard` runs after Express CORS middleware, so
  preflight needs no guard change
  ([baseline-auth.guard.ts](../../src/core/http/baseline-auth.guard.ts)).

## To do

1. **`GET /setup`** — new `SetupStateController` under `@Controller('setup')`,
   **without** `SetupGuard`, method `@Public()`, `@Header('Cache-Control',
'no-store')`. Returns `{ state }` from `SetupService.resolveState()`. Does
   **not** expose the pinned email. Register it in the identity accounts module.
2. **`http.cors_allowed_origins`** — new `infra` parameter in `registry.ts`
   (`list: true`, `schema` = array of URL strings, `default: []`,
   `hotReloadable: false`, `secret: false`).
3. **`main.ts`** — after config resolves, when the list is non-empty:
   `app.enableCors({ origin: <list>, methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'], allowedHeaders: ['authorization','content-type','x-request-id'], exposedHeaders: ['x-request-id'], maxAge: 600 })`.
   Empty list ⇒ leave CORS off (current behaviour).
4. **Docs** — document the key in
   [config.example.toml](../../config.example.toml) and
   [.env.example](../../.env.example) with the local-dev origins (client-web and
   admin console; confirm ports at implementation).
5. **Tests** — `GET /setup` returns each state (unit on the controller or an
   e2e per fixture); a config spec for `http.cors_allowed_origins` default and
   env-list parsing; an e2e asserting the `Access-Control-Allow-Origin` header
   for an allowed origin when the list is set.
6. **`http/` collection** — `http/setup/state.hurl` (`GET /setup`). Keep the
   layout block in [http/README.md](../../http/README.md) in sync.
7. **CHANGELOG.md** — bullets under `## [Unreleased]` tagged with this issue.

## Dependencies

- [46-monorepo-restructure](46-monorepo-restructure.md) — these files then live
  under `apps/backend/`.
