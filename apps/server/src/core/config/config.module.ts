import { Global, Module } from '@nestjs/common';
import { ConfigService } from './config.service.js';
import { SettingsRepository } from './settings.repository.js';

/**
 * Global layered configuration (ADR 0009, technical.md §2). The factory loads
 * the file, the environment and the settings table before handing the service
 * out, so providers that read a parameter while being constructed (the mailer,
 * the storage driver) get the configured value, not the code default. Invalid
 * infra parameters abort boot here.
 */
@Global()
@Module({
  providers: [
    SettingsRepository,
    {
      provide: ConfigService,
      useFactory: async (settingsRepo: SettingsRepository) => {
        const config = new ConfigService(settingsRepo);
        await config.init();

        return config;
      },
      inject: [SettingsRepository],
    },
  ],
  exports: [ConfigService],
})
export class ConfigModule {}
