# server — server identity and discovery document

**Status**: todo
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#6](https://github.com/ekoz-chat/server/issues/6)

Reference: [../features/server-core/technical.md §4](../features/server-core/technical.md#4-server-identity)
and [ADR 0007](../../docs/technical/adr/0007-user-identifier.md).

## To do

1. Validate `server.domain` at boot: FQDN, not an IP, not `localhost`, not a bare
   hostname, lowercased.
2. Start guard: refuse to start if `server.domain` changed while users exist
   (would break every `name/server` identifier).
3. `GET /.well-known/ekoz` (public, cacheable) returning
   `{ server, api, web, protocol_versions: ["0"], signing_keys: { <keyId>: { public_key, valid_from, valid_until } } }`
   from `ConfigService` + `SigningService`.
4. Document the shape in `spec/docs/protocol/` and bump
   `spec/docs/protocol/CHANGELOG.md`.

## Dependencies

- [4-config-system](4-config-system.md)
- [5-crypto-and-signing-keys](5-crypto-and-signing-keys.md)
