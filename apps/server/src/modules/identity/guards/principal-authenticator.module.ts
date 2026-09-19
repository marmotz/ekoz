import { Global, Module } from '@nestjs/common';
import { PRINCIPAL_AUTHENTICATOR } from '../../../core/http/principal-authenticator.js';
import { IdentityModule } from '../identity.module.js';
import { IdentityPrincipalAuthenticator } from './identity-principal-authenticator.js';

/**
 * Binds core/http's `PRINCIPAL_AUTHENTICATOR` seam to identity's real
 * verification (`docs/technical/shared-auth-guard.md`), the same pattern as
 * `OwnerLookupModule` for `OWNER_LOOKUP`.
 *
 * `@Global()` so `AuthGuard`, instantiated wherever a controller applies
 * `@UseGuards(AuthGuard)` (identity's own controllers, and any other feature
 * module), can resolve this token regardless of which module declared it.
 */
@Global()
@Module({
  imports: [IdentityModule],
  providers: [
    IdentityPrincipalAuthenticator,
    { provide: PRINCIPAL_AUTHENTICATOR, useExisting: IdentityPrincipalAuthenticator },
  ],
  exports: [PRINCIPAL_AUTHENTICATOR],
})
export class PrincipalAuthenticatorModule {}
