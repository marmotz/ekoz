import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigModule } from './config.module.js';
import { ConfigService } from './config.service.js';
import { SettingsRepository } from './settings.repository.js';

const PROBE = Symbol('PROBE');

/** Stands for the mailer / storage factories: reads the configuration while being built. */
@Module({
  providers: [
    {
      provide: PROBE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        port: config.get('email.smtp.port'),
        from: config.get('email.from'),
      }),
    },
  ],
})
class ProbeModule {}

describe('ConfigModule (unit)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('hands out a loaded configuration to providers built from it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ekoz-cfg-'));
    const file = join(dir, 'config.toml');
    writeFileSync(
      file,
      `
[server]
domain = "ekoz.example.com"
api_url = "https://api.ekoz.example.com"
web_url = "https://app.ekoz.example.com"
[database]
url = "postgres://localhost/ekoz"
[secret]
key = "${Buffer.alloc(32).toString('base64')}"
[email]
from = "Ekoz <no-reply@ekoz.example.com>"
`,
    );
    vi.stubEnv('EKOZ_CONFIG_FILE', file);
    vi.stubEnv('EKOZ_EMAIL__SMTP__PORT', '1010');

    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule, ProbeModule] })
      .overrideProvider(SettingsRepository)
      .useValue({ loadAll: async () => new Map() })
      .compile();

    expect(moduleRef.get(PROBE)).toEqual({ port: 1010, from: 'Ekoz <no-reply@ekoz.example.com>' });
  });
});
