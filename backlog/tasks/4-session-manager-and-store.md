# sdk-js — session manager, store adapter and lifecycle events

**Status**: todo
**Type**: sdk
**Issue**: [#4](https://github.com/ekoz-chat/sdk-js/issues/4)

Reference: [../features/sdk-foundations/technical.md §7](../features/sdk-foundations/technical.md#7-cycle-de-vie-tokens-et-sessions--sessionmanager), [§8](../features/sdk-foundations/technical.md#8-adaptateur-de-stockage--sessionstore), [§9](../features/sdk-foundations/technical.md#9-émetteur-dévénements).

## Verified findings

- Token model: short access JWT (~15 min) + rotating single-use opaque refresh;
  reuse of a consumed refresh revokes the whole session
  ([ADR 0008](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0008-auth-and-sessions.md),
  [ADR 0023](https://github.com/ekoz-chat/spec/blob/main/docs/technical/adr/0023-identity-account-and-token-mechanics.md)).
- `POST /auth/refresh` body `{ refreshToken }` → `{ accessToken, refreshToken, expiresIn }`
  ([server auth.service.ts](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/auth/auth.service.ts)).
- `auth.unauthenticated` from the auth guard on an expired/invalid access token;
  `auth.refresh_reuse` / `auth.refresh_invalid` on refresh failure
  ([identity.errors.ts:52](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/identity.errors.ts#L52)).

## To do

1. `src/session/session-store.ts`: `SessionStore` interface
   (`load` / `save` / `clear`, sync or async), `SessionState`
   (`refreshToken`, `sessionId`, `identifier`), and a `memoryStore()` default.
2. `src/session/events.ts`: typed emitter (`on` / `off` / `once`) with events
   `session:authenticated`, `session:refreshed`, `session:invalid`
   (`reason: 'refresh_reuse' | 'refresh_failed' | 'logout' | 'account_suspended'`),
   `session:cleared`. ~30 lines, no Node `EventEmitter` dependency.
3. `src/session/session-manager.ts`:
   - In-memory `{ accessToken, accessExpiresAt, refreshToken, sessionId, identifier }`;
     access token never persisted.
   - `attachAuth(headers)` injects `Authorization: Bearer`.
   - `establish(bundle)` from login/setup responses → `store.save`, emit
     `session:authenticated`.
   - On `auth.unauthenticated` with a refresh token in memory: single-flight
     `POST /auth/refresh` (shared promise), replace state, `store.save`, emit
     `session:refreshed`, replay the original request **once**. Not triggered by
     `auth.invalid_credentials` or `identity.account_suspended`.
   - Proactive refresh when `accessExpiresAt` is passed before an authed call.
   - Refresh failure (`auth.refresh_reuse` / `auth.refresh_invalid`): clear
     state, `store.clear`, emit `session:invalid` then `session:cleared`, reject
     with the typed error.
   - `identity.account_suspended` on an authed call → emit `session:invalid`
     (`account_suspended`).
   - `logout()`: `POST /auth/logout` then local clear + `store.clear` + events,
     even if the network call fails.
   - `resume()`: from `store.load()`, mount cold state and force a refresh; a
     failure emits `session:invalid` and leaves the client unauthenticated (no
     uncaught throw).
4. Unit tests: single-flight (N concurrent 401s → 1 refresh); replay-once;
   reuse → `session:invalid` + `store.clear`; no refresh on
   `auth.invalid_credentials`; cold resume happy + failure paths.

## Dependencies

[2-transport-core-and-errors](2-transport-core-and-errors.md), [3-discovery-and-protocol-guard](3-discovery-and-protocol-guard.md).
