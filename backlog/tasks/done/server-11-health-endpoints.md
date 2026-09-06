# server — health and readiness endpoints

**Status**: done
**Type**: backend
**Issue**: — (implemented before the monorepo consolidation)

Reference: [../features/server-core/technical.md §9](../../features/server-core/technical.md#9-health).

## To do

1. `GET /healthz`: process up, no dependency checks, always `200` when serving.
2. `GET /readyz`: check DB reachable, migrations current, an active signing key
   present, storage driver writable. `200` with a per-check breakdown, or `503`
   with the failing checks.
3. Wire both into the Docker/compose healthcheck.

## Dependencies

- [2-prisma-setup](server-2-prisma-setup.md)
- [5-crypto-and-signing-keys](server-5-crypto-and-signing-keys.md)
- [9-object-storage](server-9-object-storage.md)
