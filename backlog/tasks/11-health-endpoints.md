# server — health and readiness endpoints

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#11](https://github.com/ekoz-chat/server/issues/11)

Reference: [../features/server-core/technical.md §9](../features/server-core/technical.md#9-health).

## To do

1. `GET /healthz`: process up, no dependency checks, always `200` when serving.
2. `GET /readyz`: check DB reachable, migrations current, an active signing key
   present, storage driver writable. `200` with a per-check breakdown, or `503`
   with the failing checks.
3. Wire both into the Docker/compose healthcheck.

## Dependencies

- [2-prisma-setup](2-prisma-setup.md)
- [5-crypto-and-signing-keys](5-crypto-and-signing-keys.md)
- [9-object-storage](9-object-storage.md)
