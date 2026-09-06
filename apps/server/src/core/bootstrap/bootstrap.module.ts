import { Global, Module } from '@nestjs/common';
import { BootstrapService } from './bootstrap.service.js';
import { SetupGuard } from './setup.guard.js';
import { SetupService } from './setup.service.js';

/**
 * Bootstrap and setup state machine. Provides the setup state resolution, the single-use token,
 * {@link SetupGuard} and the `server.initialized` audit hook. The `POST /setup/owner` endpoint that creates
 * the first `User` lives in identity-and-profiles and wires these together.
 *
 * Global so identity can inject `SetupService` / `SetupGuard` without
 * re-importing. Identity binds the real `OWNER_LOOKUP` via its own
 * `OwnerLookupModule`; `SetupService` falls back to `NoOwnerLookup` when the
 * token is unbound (server-core running without the identity feature).
 */
@Global()
@Module({
  providers: [SetupService, SetupGuard, BootstrapService],
  exports: [SetupService, SetupGuard],
})
export class BootstrapModule {}
