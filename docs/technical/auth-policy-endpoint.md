# Auth policy endpoint

## Context

A client must pick the right registration form and tell the user what a valid
password looks like before anything is submitted. The facts it needs are held
by the server:

- `registration.mode` (`open` / `invite` / `admin`) and
  `email.verification_required` are runtime, hot-reloadable settings.
- The password policy is a server constant (`MIN_PASSWORD_LENGTH`, plus a
  common-password list) enforced in `assertAcceptable`, not in the request DTO.
  The generated schema therefore only says `password: string`, min 1.

No unauthenticated endpoint exposed any of this.

## Decision

A public `GET /auth/policy`, served by `AuthPolicyController` in the identity
module, next to `GET /setup` (same pattern: `@Public()`,
`Cache-Control: no-store`).

```json
{ "registrationMode": "invite", "emailVerificationRequired": true, "passwordMinLength": 10 }
```

- Values are read from `ConfigService` on every request, so a change made by
  the owner is visible on the next call. Nothing is cached, hence `no-store`.
- Nothing secret is exposed: the same facts are observable by trying to
  register.
- No dedicated throttle: it is a cheap read of three values, the global limits
  apply.
- The wire contract is in [identity protocol](../protocol/identity.md); the
  OpenAPI description and SDK type follow the usual flow
  ([OpenAPI description and SDK types](openapi-description-and-sdk-types.md)).

## Alternatives considered

| Option                                       | Why not                                                                                                                             |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Fields in the discovery document             | Cached for 5 minutes, so a mode change stays invisible for that long; it also mixes runtime settings into a document peers read for federation. |
| Extend `GET /setup`                          | It answers "is first-owner setup open", not anything about registration; it stays a sibling that answers forever.                    |
| Client tries to register and reads the error | Cannot render an invitation field or a "closed" message before the user fills a form, and cannot know the minimum password length.  |

## Consequences

- A client can adapt its sign-up screen (invitation field, "registration
  closed" message, "check your mailbox" vs. immediate login) and its password
  hint from one cheap call.
- One more public route to keep in step with the settings it mirrors; the e2e
  suite covers the three modes and the verification flag.
- `passwordMinLength` mirrors a constant, not a setting: making the policy
  configurable later only changes where the server reads it from.
