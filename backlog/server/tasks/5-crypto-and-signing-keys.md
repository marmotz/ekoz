# server — crypto helpers and server signing keys

**Status**: done
**Type**: backend
**Repo**: ekoz-chat/server
**Issue**: [#5](https://github.com/ekoz-chat/server/issues/5)

Reference: [../features/server-core/technical.md §4](../features/server-core/technical.md#4-server-identity)
and [ADR 0006](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0006-federation-protocol.md).

## To do

1. `SecretBox`: AES-256-GCM seal/open using the 32-byte `secret.key` (infra
   config) as the key-encryption key.
2. `ServerSigningKey` Prisma model (`id`, `algorithm`, `publicKey`,
   `privateKeyEnc` bytes, `createdAt`, `activatedAt`, `retiredAt`).
3. Ed25519 keypair generation with `crypto.generateKeyPair('ed25519')` (validated
   under Bun by the POC); store the private key sealed with `SecretBox`.
4. `SigningService.sign(bytes)` / `verify(keyId, bytes, sig)`; exactly one active
   key; `getActiveKey()` / `listPublicKeys()`.
5. Rotation: `rotate()` inserts a new active key, sets `retiredAt` on the
   previous one plus an overlap window (config, default 7d); a sweep drops keys
   past the window.
6. Hashing helpers used elsewhere: SHA-256 for opaque-token hashing.

## Dependencies

- [2-prisma-setup](2-prisma-setup.md)
- [4-config-system](4-config-system.md)
