# sdk-js — HTTP transport core and typed errors

**Status**: done
**Type**: sdk
**Issue**: [#2](https://github.com/ekoz-chat/sdk-js/issues/2)

Reference: [../features/sdk-foundations/technical.md §3](../features/sdk-foundations/technical.md#3-cœur-transport--httpclient), [§6](../features/sdk-foundations/technical.md#6-modèle-derreurs-typées).

## Verified findings

- Error shape: `application/problem+json` `{ type, title, status, detail, code, errors?, requestId? }`
  ([server problem-details.ts:26](https://github.com/ekoz-chat/server/blob/main/src/core/http/problem-details.ts#L26),
  [HTTP API conventions](../../../docs/technical/api-conventions.md)).
- `code` is stable and namespaced (`auth.*` / `identity.*`), full list in
  [server identity.errors.ts](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/identity.errors.ts).
- `429` carries `Retry-After` ([identity.errors.ts:229](https://github.com/ekoz-chat/server/blob/main/src/modules/identity/identity.errors.ts#L229)).
- Server generates/echoes `X-Request-Id` ([request-context.middleware.ts](https://github.com/ekoz-chat/server/blob/main/src/core/http/request-context.middleware.ts)).

## To do

1. `src/transport/http-client.ts`: `request(method, path, { body, formData, query, signal, headers, requestId })`.
   Uses global `fetch`. Default headers: `Accept: application/json`,
   `X-Ekoz-Protocol: 0`, `X-Request-Id` (generated `crypto.randomUUID()` unless
   supplied). JSON body serialised; `formData` passed through without forcing
   `Content-Type`. `204` / empty → `undefined`. No automatic network retry.
2. `src/transport/request-context.ts`: per-request id generation and helper to
   read it back for error correlation.
3. `src/transport/errors.ts`: `EkozError` base (`code`, `status`, `detail`,
   `title`, `requestId`, `retryAfter?`) and subclasses:
   `ValidationError` (`issues[]`), `NotFoundError`, `RateLimitError`,
   `AuthenticationError`, `NetworkError`, `ServerError`, plus the identity
   business errors from §6 (`InvalidCredentialsError`, `RefreshInvalidError`,
   `RefreshReuseError`, `AccountSuspendedError`, `EmailNotVerifiedError`,
   `UsernameTakenError`, `RegistrationClosedError`, `InvitationInvalidError`,
   `EmailTakenError`, `WeakPasswordError`, `UsernameImmutableError`,
   `UsernameChangeCooldownError`, `LastOwnerError`, ...).
4. `src/transport/problem.ts`: single decode path — parse the body, map `code`
   → error class, fall back to generic `EkozError` (keeping the raw `code`) on
   unknown codes; read `Retry-After`.
5. `ProtocolMismatchError` class (not tied to a server `code`).
6. Unit tests: each `code` → right class; unknown code → generic; `429` →
   `retryAfter`; `500` → `ServerError` without leaking detail; `fetch` throw →
   `NetworkError`; `X-Request-Id` generated and surfaced on errors.

## Dependencies

[1-package-skeleton](1-package-skeleton.md), [the SDK packaging and protocol-version policy design (ekoz-chat/spec#2)](https://github.com/ekoz-chat/spec/blob/main/backlog/tasks/2-adr-0025-sdk-packaging.md).
