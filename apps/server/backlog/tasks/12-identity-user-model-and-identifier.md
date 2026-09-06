# server — identity: user model, identifier, password hashing

**Status**: done
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#12](https://github.com/ekoz-chat/server/issues/12)

Reference: [../features/identity-and-profiles/technical.md §4-§6](../features/identity-and-profiles/technical.md#4-data-model-prisma-slice),
[ADR 0007](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0007-user-identifier.md).

## To do

1. Prisma models: `User`, `UserProfile`, `ReservedUsername` (§4). `citext`
   extension for `email`.
2. Identifier service: normalise (trim, NFC, lowercase), validate
   `^[a-z0-9](?:[a-z0-9_.-]{0,62}[a-z0-9])?$`, reject `identity.reserved_usernames`.
3. Availability check: not held by an active/suspended `User.name` and not in
   `reserved_username` with `reservedUntil > now()`.
4. Password hashing with `@node-rs/argon2` (Argon2id, `memoryCost 19456`,
   `timeCost 2`, `parallelism 1`); rehash-on-login when params drift; dummy verify
   on unknown user.
5. Register the identity config params (§3) in the server-core registry.

## Dependencies

- server-core [#2 Prisma setup](2-prisma-setup.md), [#4 config system](4-config-system.md)
