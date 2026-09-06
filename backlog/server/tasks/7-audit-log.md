# server — audit log

**Status**: done
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#7](https://github.com/ekoz-chat/server/issues/7)

Reference: [../features/server-core/technical.md §8](../features/server-core/technical.md#8-audit-log).

## To do

1. `AuditLog` Prisma model (append-only): `id`, `at`, `actorUserId?`, `actorIp?`,
   `action`, `targetType?`, `targetId?`, `metadata` jsonb. Indexes on `at` and
   `actorUserId`.
2. `AuditService.record(entry)` — reads actor/ip from the request context when
   not passed explicitly. No update/delete API.
3. Unit tests; a helper for assertions in other features' integration tests.

## Dependencies

- [2-prisma-setup](2-prisma-setup.md)
- [3-http-conventions](3-http-conventions.md) (request context)
