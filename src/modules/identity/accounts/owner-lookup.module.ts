import { Global, Module } from '@nestjs/common';
import { OWNER_LOOKUP } from '../../../core/bootstrap/owner-lookup.js';
import { IdentityModule } from '../identity.module.js';
import { IdentityOwnerLookup } from './owner-lookup.js';

/**
 * Binds server-core's `OWNER_LOOKUP` seam to identity's real query (issue #18).
 *
 * `SetupService` lives in the global `BootstrapModule` and resolves
 * `OWNER_LOOKUP` from the module graph; this `@Global()` module is the single
 * binding for the token once identity is loaded, so no ordering ambiguity with
 * the `NoOwnerLookup` fallback (which `SetupService` only uses when nothing
 * provides the token at all).
 */
@Global()
@Module({
  imports: [IdentityModule],
  providers: [IdentityOwnerLookup, { provide: OWNER_LOOKUP, useExisting: IdentityOwnerLookup }],
  exports: [OWNER_LOOKUP],
})
export class OwnerLookupModule {}
