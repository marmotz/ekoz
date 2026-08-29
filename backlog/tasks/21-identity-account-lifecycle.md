# server — identity: suspension, deletion, owner management

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#21](https://github.com/ekoz-chat/server/issues/21)

Reference: [../features/identity-and-profiles/technical.md §15](../features/identity-and-profiles/technical.md#15-suspension-deletion-owners).

## To do

1. Suspension (owner): `POST /admin/users/:id/suspend { reason }` →
   `status = suspended`, revoke every session, audit; `.../unsuspend`.
   Suspended user → `403` on any authenticated request, login blocked.
2. Deletion: `DELETE /me { password }` (re-auth) and `DELETE /admin/users/:id`
   (owner). One transaction: `status = deleted`, revoke sessions, scrub
   `UserProfile` (`displayName = "Deleted account"`, `bio = null`, release
   avatar blob), null `User.name` / `User.email`, insert `ReservedUsername`
   (`reservedUntil = now + identity.username_release_delay`), audit
   `identity.account_deleted`.
3. Owners: `POST /admin/owners { userId }` / `DELETE /admin/owners/:userId`;
   enforce **at least one owner** (cannot delete/suspend/demote the last owner).
4. Record the forward contract for conversations (deleted-user resolution,
   authorship by `User.id`).

## Dependencies

- [12-identity-user-model-and-identifier](12-identity-user-model-and-identifier.md)
- [14-identity-session-management](14-identity-session-management.md)
- server-core [#7 audit log](7-audit-log.md)
