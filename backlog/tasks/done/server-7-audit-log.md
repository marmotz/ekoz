# server — audit log

**Status**: done
**Type**: backend
**Issue**: — (implemented before the monorepo consolidation)

Reference: [../features/server-core/technical.md §8](../../features/server-core/technical.md#8-audit-log).

## To do

1. `AuditLog` Prisma model (append-only): `id`, `at`, `actorUserId?`, `actorIp?`,
   `action`, `targetType?`, `targetId?`, `metadata` jsonb. Indexes on `at` and
   `actorUserId`.
2. `AuditService.record(entry)` — reads actor/ip from the request context when
   not passed explicitly. No update/delete API.
3. Unit tests; a helper for assertions in other features' integration tests.

## Dependencies

- [2-prisma-setup](server-2-prisma-setup.md)
- [3-http-conventions](server-3-http-conventions.md) (request context)
