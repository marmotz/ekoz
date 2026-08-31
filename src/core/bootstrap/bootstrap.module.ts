import { Global, Module } from '@nestjs/common';
import { BootstrapService } from './bootstrap.service.js';
import { NoOwnerLookup, OWNER_LOOKUP } from './owner-lookup.js';
import { SetupGuard } from './setup.guard.js';
import { SetupService } from './setup.service.js';

/**
 * Bootstrap and setup state machine. Provides the setup state resolution, the single-use token,
 * {@link SetupGuard} and the `server.initialized` audit hook. The `POST /setup/owner` endpoint that creates
 * the first `User` lives in identity-and-profiles and wires these together.
 *
 * Global so identity can inject `SetupService` / `SetupGuard` and override
 * {@link OWNER_LOOKUP} without re-importing.
 */
@Global()
@Module({
  providers: [SetupService, SetupGuard, BootstrapService, { provide: OWNER_LOOKUP, useClass: NoOwnerLookup }],
  exports: [SetupService, SetupGuard, OWNER_LOOKUP],
})
export class BootstrapModule {}
