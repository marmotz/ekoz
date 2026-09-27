import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller.js';

/**
 * `GET/PUT/DELETE /admin/settings` (technical.md §2, issue #145), split out
 * from {@link ConfigModule} so that module's own isolated unit test
 * (`config.module.spec.ts`) does not have to satisfy `AuthGuard`'s
 * dependencies — this controller relies on them being available globally in
 * the real app (`PrincipalAuthenticatorModule`).
 */
@Module({
  controllers: [SettingsController],
})
export class SettingsModule {}
