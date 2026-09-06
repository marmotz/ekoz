# server — public setup-state probe and CORS support

**Status**: todo
**Type**: backend
**Issue**: [#15](https://github.com/marmotz/ekoz/issues/15)

Reference: [../features/server-administration/technical.md §2.4, §2.5](../features/server-administration/technical.md#24-get-setup-public)
and [configuration model](../../docs/technical/configuration-model.md).

The admin console runs on its own origin and must decide, before anyone signs
in, whether to show the setup screen or the login screen. Two small pieces of
plumbing: a public setup-state probe and an origin allow-list for CORS.

## Verified findings

- `main.ts` calls no `app.enableCors` — CORS is off everywhere
  ([main.ts](../../apps/server/src/main.ts)).
- `SetupController` is `@UseGuards(SetupGuard)`
  ([setup.controller.ts](../../apps/server/src/modules/identity/accounts/setup.controller.ts)),
  so any route under it returns `410 Gone` once an owner exists — a state probe
  cannot live there.
- `SetupService.resolveState()` already returns
  `'closed' | 'email-pinned' | 'token-pinned'`
  ([setup.service.ts:47](../../apps/server/src/core/bootstrap/setup.service.ts)).
- The config registry partitions `infra` / `runtime` and supports `list: true`
  ([registry.ts](../../apps/server/src/core/config/registry.ts)); `main.ts` reads bootstrap
  parameters after `app.init()`.
- The global `BaselineAuthGuard` runs after Express CORS middleware, so
  preflight needs no guard change
  ([baseline-auth.guard.ts](../../apps/server/src/core/http/baseline-auth.guard.ts)).

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
   [config.example.toml](../../apps/server/config.example.toml) and
   [.env.example](../../apps/server/.env.example) with the local-dev origins (client-web and
   admin console; confirm ports at implementation).
5. **Tests** — `GET /setup` returns each state (unit on the controller or an
   e2e per fixture); a config spec for `http.cors_allowed_origins` default and
   env-list parsing; an e2e asserting the `Access-Control-Allow-Origin` header
   for an allowed origin when the list is set.
6. **`http/` collection** — `http/setup/state.hurl` (`GET /setup`). Keep the
   layout block in [http/README.md](../../apps/server/http/README.md) in sync.
7. **CHANGELOG.md** — bullets under `## [Unreleased]` tagged with this issue.

## Dependencies

- 46-monorepo-restructure (done — `tasks/done/server-46-monorepo-restructure.md`) — these files then live
  under `apps/backend/`.
