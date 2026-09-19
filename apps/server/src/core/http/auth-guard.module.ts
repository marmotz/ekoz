import { Global, Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';
import { OwnerGuard } from './owner.guard.js';

/**
 * Shared `AuthGuard` / `OwnerGuard` providers, any feature module opts into
 * with `@UseGuards(...)` (`docs/technical/shared-auth-guard.md`). Kept out of
 * `HttpModule` so a minimal test module built from `HttpModule` alone is not
 * forced to also bind `PRINCIPAL_AUTHENTICATOR` (see `PrincipalAuthenticatorModule`).
 *
 * `@Global()` so every feature module can use the guards without an explicit
 * import; `AuthGuard`'s own `PRINCIPAL_AUTHENTICATOR` dependency still needs
 * `PrincipalAuthenticatorModule` loaded somewhere in the graph (the identity
 * feature binds it; `AppModule` imports both).
 */
@Global()
@Module({
  providers: [AuthGuard, OwnerGuard],
  exports: [AuthGuard, OwnerGuard],
})
export class AuthGuardModule {}
