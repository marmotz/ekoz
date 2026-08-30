import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { startTestDatabase, type TestDatabase } from '../prisma/testing/test-database.js';
import { ConfigService } from './config.service.js';
import { SettingsRepository } from './settings.repository.js';

const TOML = `
[server]
domain = "ekoz.example.com"
api_url = "https://api.ekoz.example.com"
web_url = "https://app.ekoz.example.com"
[database]
url = "postgres://localhost/ekoz"
[secret]
key = "${Buffer.alloc(32).toString('base64')}"
`;

describe('ConfigService + settings table (integration)', () => {
  let database: TestDatabase;
  let repo: SettingsRepository;
  let config: ConfigService;

  beforeAll(async () => {
    database = await startTestDatabase();
    const prisma = { orm: database.db.orm } as unknown as PrismaService;
    repo = new SettingsRepository(prisma);

    const dir = mkdtempSync(join(tmpdir(), 'ekoz-cfg-e2e-'));
    const file = join(dir, 'config.toml');
    writeFileSync(file, TOML);
    config = new ConfigService(repo, { tomlPath: file, env: {} });
    await config.init();
  }, 180_000);

  afterAll(async () => {
    await database?.stop();
  });

  it('resolves a runtime key from its default before any override', () => {
    expect(config.get('registration.mode')).toBe('invite');
  });

  it('persists a runtime override and reflects it after invalidation', async () => {
    await config.set('registration.mode', 'open', 'admin-7');
    expect(config.get('registration.mode')).toBe('open');
    expect(config.describe('registration.mode')).toMatchObject({ source: 'settings', locked: false });

    const row = await database.db.orm.public.Setting.where({ key: 'registration.mode' }).first();
    expect(row?.value).toEqual({ value: 'open' });
    expect(row?.updatedBy).toBe('admin-7');
  });

  it('validates the value against the registry on write', async () => {
    await expect(repo.set('profile.bio_max_length', -5, null)).rejects.toThrow(/invalid_value|Invalid value/i);
  });

  it('refuses to write an infra key to the settings table', async () => {
    await expect(repo.set('http.port', 9999, null)).rejects.toThrow(/infra parameter/i);
  });

  it('clears an override, reverting to the file / default', async () => {
    await config.set('registration.mode', 'admin', null);
    await config.clear('registration.mode');
    expect(config.get('registration.mode')).toBe('invite');
  });
});
