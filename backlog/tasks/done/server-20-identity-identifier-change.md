# server — identity: identifier change (policy-driven)

**Status**: done
**Type**: backend
**Issue**: — (implemented before the monorepo consolidation)

Reference: [../features/identity-and-profiles/technical.md §17](../../features/identity-and-profiles/technical.md#17-identifier-change-flows).

## To do

1. Prisma model: `UsernameChangeRequest` (§4).
2. `PATCH /me/username` `{ name }` behaviour by `identity.username_change_policy`:
   - `immutable` → `403 identity.username_immutable`;
   - `available` → validate + availability + `identity.username_change_cooldown`
     → apply now; reserve the old name
     (`reservedUntil = now + identity.username_release_delay`, reason
     `username_changed`); audit;
   - `approval` → create a `UsernameChangeRequest` (`pending`).
3. Owner endpoints: `GET /admin/username-requests`,
   `POST /admin/username-requests/:id/approve|reject`; on approve, apply + reserve
   old.
4. Confirm historical references are unaffected (they key on `User.id`).

## Dependencies

- [12-identity-user-model-and-identifier](server-12-identity-user-model-and-identifier.md)
