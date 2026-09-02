# sdk-js — client assembly and wire types

**Status**: todo
**Type**: sdk
**Issue**: [#5](https://github.com/ekoz-chat/sdk-js/issues/5)

Reference: [../features/sdk-foundations/technical.md §10](../features/sdk-foundations/technical.md#10-surface-publique), [§11](../features/sdk-foundations/technical.md#11-typage-bout-en-bout).

## Verified findings

- Payload sources: server DTOs / views —
  [account.view.ts:5](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/accounts/account.view.ts#L5),
  [session.view.ts:4](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/auth/session.view.ts#L4),
  `MeView` / `PublicProfileView`
  [profile.service.ts:22](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/profile/profile.service.ts#L22),
  and the various `*.dto.ts` under
  [server identity](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/).

## To do

1. `src/types/wire.ts`: request and response types for the whole identity
   surface, aligned with protocol v0, sourced from the server DTOs/views. No
   runtime validation, no `zod` dependency.
2. `src/config.ts`: `ClientConfig` (`server`, `store?`, `resolveApiUrl?`,
   `fetch?` override for tests), normalisation.
3. `src/client.ts`: `createClient(config)` → `EkozClient` wiring `HttpClient`,
   `Discovery`, `SessionManager`, event emitter, and the empty resource
   namespaces (`setup`, `auth`, `me`, `sessions`, `users`, `invitations`,
   `admin`, `discovery`, `session`).
4. `src/index.ts`: export `createClient`, all wire types, every error class, the
   event types.
5. Unit tests: `createClient` shape; config normalisation; event subscription
   round-trip.

## Dependencies

[2-transport-core-and-errors](2-transport-core-and-errors.md), [3-discovery-and-protocol-guard](3-discovery-and-protocol-guard.md), [4-session-manager-and-store](4-session-manager-and-store.md).
