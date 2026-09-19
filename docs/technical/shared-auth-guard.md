# Shared auth guard

## Context

`AuthGuard`, `OwnerGuard`, `CurrentPrincipal` and the `AuthPrincipal` type used
to live in the identity feature (`modules/identity/guards/`), exported by
`IdentityModule` for any controller to opt into with `@UseGuards(...)`. The
`conversations` feature (issues #1, #3) needs the same guards on its own
controllers, but `eslint-plugin-boundaries` forbids one feature module from
importing another feature module directly (`server-core` technical.md §1) —
importing `modules/identity/guards/*` from `modules/conversations/*` would
violate that rule.

## Decision

Move the generic parts to `core/http/`, which every feature module may import
freely:

- `AuthPrincipal`, `AuthenticatedRequest`, and a new `PrincipalAuthenticator`
  port (`authenticate(bearerToken): Promise<AuthPrincipal>`), behind a
  `PRINCIPAL_AUTHENTICATOR` DI token (`core/http/principal-authenticator.ts`).
- `AuthGuard` (`core/http/auth.guard.ts`): unchanged behaviour (skips
  `@Public()`, extracts the bearer token), but delegates verification to the
  bound `PrincipalAuthenticator` instead of calling `TokenService` /
  `RevokedSessionRegistry` / `AccountService` directly.
- `OwnerGuard`, `CurrentPrincipal` (`core/http/owner.guard.ts`,
  `core/http/current-principal.decorator.ts`): moved as-is, no identity
  dependency.
- `UnauthenticatedError`, `ForbiddenError` (`core/http/auth.errors.ts`): moved
  out of `identity.errors.ts` since the guards throw them.

The identity feature keeps the real implementation:
`IdentityPrincipalAuthenticator` (`modules/identity/guards/`) wraps
`TokenService` + `RevokedSessionRegistry` + `AccountService`, exactly the logic
`AuthGuard` used to inline. `PrincipalAuthenticatorModule` binds it to
`PRINCIPAL_AUTHENTICATOR`, the same seam pattern as `OwnerLookupModule` for
`OWNER_LOOKUP` (`server-core` technical.md §5): a `@Global()` module importing
`IdentityModule` and re-exporting the token, so `AuthGuard` resolves it
regardless of which module instantiates the guard.

`AuthGuard` / `OwnerGuard` themselves are provided by a separate
`core/http/auth-guard.module.ts` (`@Global()`, not folded into `HttpModule`):
a test module built from `HttpModule` alone (e.g.
`core/http/http-conventions.e2e-spec.ts`) must not be forced to also bind
`PRINCIPAL_AUTHENTICATOR` just to instantiate unrelated HTTP conventions.

## Consequences

- Any feature module can now apply `@UseGuards(AuthGuard, OwnerGuard)` and
  inject `@CurrentPrincipal()` without importing the identity feature.
- Exactly one binding of `PRINCIPAL_AUTHENTICATOR` may exist at a time; a
  second feature trying to provide its own would silently lose to
  whichever module loads last — acceptable while identity is the only account
  system, revisited if that changes.
- `AppModule` must import `AuthGuardModule` and `PrincipalAuthenticatorModule`
  (alongside `HttpModule` and `IdentityModule`) for the guards to resolve; a
  feature module that forgets `@UseGuards(AuthGuard)` still fails open only as
  much as before this change (the guard was already opt-in, not global).
