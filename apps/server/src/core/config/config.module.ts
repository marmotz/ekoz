import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service.js';
import { SettingsRepository } from './settings.repository.js';

/**
 * Global layered configuration (ADR 0009, technical.md §2). `ConfigService`
 * validates every infra parameter on module init and aborts boot on failure.
 */
@Global()
@Module({
  providers: [
    SettingsRepository,
    {
      provide: ConfigService,
      useFactory: (settingsRepo: SettingsRepository) => new ConfigService(settingsRepo),
      inject: [SettingsRepository],
    },
  ],
  exports: [ConfigService],
})
export class ConfigModule {}
