# server — layered configuration system

**Status**: done
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#4](https://github.com/ekoz-chat/server/issues/4)

Reference: [../features/server-core/technical.md §2](../features/server-core/technical.md#2-configuration-system)
and [configuration model](../../../docs/technical/configuration-model.md).

## To do

1. TOML loader (`smol-toml`); `${ENV_VAR}` interpolation in string values at load
   time.
2. `EKOZ_<SECTION>__<KEY>` 12-factor overrides; an env override on a `runtime`
   parameter marks it **locked**.
3. Parameter registry (`src/core/config/registry.ts`): per key `kind`
   (`infra` | `runtime`), Zod `schema`, `default`, `hotReloadable`, `secret`.
   Seed with the §2 table (server-core params only; feature params are added by
   their own tasks).
4. `Setting` Prisma model (`key`, `value` jsonb, `updatedAt`, `updatedBy`) —
   `runtime` keys only, validated against the registry on write.
5. Resolution `defaults < TOML < settings table < env`; `infra` keys never read
   the settings table.
6. `ConfigService.get(key)` (validated) and `ConfigService.describe(key)`
   (`{ value, source, locked, hotReloadable }`).
7. Hot-reload: short-TTL cache + invalidation signal for `hotReloadable` runtime
   keys; others flagged "restart required".
8. Boot validation: abort with a clear message on any missing/invalid `infra`
   parameter.

## Dependencies

- [2-prisma-setup](2-prisma-setup.md)
- [3-http-conventions](3-http-conventions.md)
