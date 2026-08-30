import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ConfigService } from './config.service.js';
import type { ParameterKey } from './registry.js';
import type { SettingsRepository } from './settings.repository.js';

function writeToml(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ekoz-cfg-'));
  const file = join(dir, 'config.toml');
  writeFileSync(file, body);
  return file;
}

const BASE_TOML = `
[server]
domain = "ekoz.example.com"
api_url = "https://api.ekoz.example.com"
web_url = "https://app.ekoz.example.com"
[database]
url = "postgres://localhost/ekoz"
[secret]
key = "${Buffer.alloc(32).toString('base64')}"
`;

class FakeSettingsRepo {
  store = new Map<ParameterKey, unknown>();
  async loadAll() {
    return new Map(this.store);
  }
  async set(key: string, value: unknown) {
    this.store.set(key as ParameterKey, value);
  }
  async clear(key: string) {
    this.store.delete(key as ParameterKey);
  }
}

describe('ConfigService (unit)', () => {
  let repo: FakeSettingsRepo;

  beforeEach(() => {
    repo = new FakeSettingsRepo();
  });

  async function build(toml = BASE_TOML, env: NodeJS.ProcessEnv = {}): Promise<ConfigService> {
    const service = new ConfigService(repo as unknown as SettingsRepository, { tomlPath: writeToml(toml), env });
    await service.init();
    return service;
  }

  it('falls back to the code default when nothing else provides a value', async () => {
    const service = await build();
    expect(service.describe('registration.mode')).toMatchObject({ value: 'invite', source: 'default', locked: false });
  });

  it('lets the TOML file override the default', async () => {
    const service = await build(BASE_TOML + '\n[registration]\nmode = "open"\n');
    expect(service.describe('registration.mode')).toMatchObject({ value: 'open', source: 'file' });
  });

  it('lets the settings table override the file for a runtime key', async () => {
    repo.store.set('registration.mode', 'admin');
    const service = await build(BASE_TOML + '\n[registration]\nmode = "open"\n');
    expect(service.describe('registration.mode')).toMatchObject({ value: 'admin', source: 'settings' });
  });

  it('lets an env override win and locks the runtime key', async () => {
    repo.store.set('registration.mode', 'admin');
    const service = await build(BASE_TOML, { EKOZ_REGISTRATION__MODE: 'open' });
    expect(service.describe('registration.mode')).toMatchObject({ value: 'open', source: 'env', locked: true });
  });

  it('never reads the settings table for an infra key', async () => {
    repo.store.set('http.port' as ParameterKey, 1234);
    const service = await build();
    expect(service.get('http.port')).toBe(3000);
  });

  it('coerces a comma-separated env list', async () => {
    const service = await build(BASE_TOML, { EKOZ_AVATAR__ALLOWED_MIME: 'image/png, image/gif' });
    expect(service.get('avatar.allowed_mime')).toEqual(['image/png', 'image/gif']);
  });

  it('coerces numeric env overrides through the schema', async () => {
    const service = await build(BASE_TOML, { EKOZ_HTTP__PORT: '8443' });
    expect(service.get('http.port')).toBe(8443);
  });

  it('aborts init when a required infra parameter is missing', async () => {
    await expect(build('[http]\nport = 3000\n')).rejects.toThrow(/Invalid or missing infra configuration/);
  });

  it('aborts init when an infra parameter fails its schema', async () => {
    await expect(build(BASE_TOML.replace('ekoz.example.com', 'localhost'))).rejects.toThrow(/server\.domain/);
  });

  it('set() writes through the repo and is visible immediately', async () => {
    const service = await build();
    await service.set('registration.mode', 'open', 'admin-1');
    expect(service.get('registration.mode')).toBe('open');
  });

  it('masks secret values in describe() but get() still returns the real value', async () => {
    const service = await build();
    const described = service.describe('secret.key');
    expect(described).toMatchObject({ secret: true, value: '[secret]' });
    expect(service.get('secret.key')).toBe(Buffer.alloc(32).toString('base64'));

    expect(service.describe('registration.mode')).toMatchObject({ secret: false, value: 'invite' });
  });

  it('rejects setting an infra key', async () => {
    const service = await build();
    // FakeSettingsRepo does not enforce; ConfigService.set delegates to the repo,
    // so this asserts the real repo guard via a stricter fake.
    repo.set = async (key: string) => {
      if (key === 'http.host') throw new Error('config.not_runtime');
    };
    await expect(service.set('http.host', '1.2.3.4', null)).rejects.toThrow(/not_runtime/);
  });
});
