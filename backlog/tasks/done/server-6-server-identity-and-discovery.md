# server — server identity and discovery document

**Status**: done
**Type**: backend
**Issue**: — (implemented before the monorepo consolidation)

Reference: [../features/server-core/technical.md §4](../../features/server-core/technical.md#4-server-identity)
and [user identifier](../../../docs/technical/user-identifier.md).

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

- [4-config-system](server-4-config-system.md)
- [5-crypto-and-signing-keys](server-5-crypto-and-signing-keys.md)
