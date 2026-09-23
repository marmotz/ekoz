import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigService } from './config.service.js';
import { buildConfigSummary, redactUrl } from './config-summary.js';
import type { ParameterKey } from './registry.js';
import type { SettingsRepository } from './settings.repository.js';

const SECRET_KEY = Buffer.alloc(32, 7).toString('base64');

const BASE_TOML = `
[server]
domain = "ekoz.example.com"
api_url = "https://api.ekoz.example.com"
web_url = "https://app.ekoz.example.com"
[database]
url = "postgres://ekoz:db-password@db.internal:5432/ekoz?sslmode=require&password=leak"
[secret]
key = "${SECRET_KEY}"
[email.smtp]
host = "smtp.example.com"
port = 587
user = "mailer"
pass = "smtp-password"
`;

async function summary(
  env: NodeJS.ProcessEnv = {},
  settings: Map<ParameterKey, unknown> = new Map(),
): Promise<string[]> {
  const dir = mkdtempSync(join(tmpdir(), 'ekoz-summary-'));
  const tomlPath = join(dir, 'config.toml');
  writeFileSync(tomlPath, BASE_TOML);
  const repo = { loadAll: async () => new Map(settings) } as unknown as SettingsRepository;
  const config = new ConfigService(repo, { tomlPath, env });
  await config.init();
  return buildConfigSummary(config);
}

function section(lines: string[], name: string): string {
  const line = lines.find((l) => l.startsWith(`[${name}] `));
  expect(line, `section ${name}`).toBeDefined();
  return line as string;
}

describe('buildConfigSummary (unit)', () => {
  it('prints one line per top-level section', async () => {
    const lines = await summary();
    const names = lines.map((l) => /^\[(\w+)\]/.exec(l)?.[1]);
    expect(names).toContain('email');
    expect(names).toContain('storage');
    expect(new Set(names).size).toBe(names.length);
  });

  it('shows the SMTP relay with its source and masks the credentials', async () => {
    const email = section(await summary(), 'email');
    expect(email).toContain('smtp.host=smtp.example.com (file)');
    expect(email).toContain('smtp.port=587 (file)');
    expect(email).toContain('smtp.secure=false');
    expect(email).toContain('smtp.user=[secret] (file)');
    expect(email).toContain('smtp.pass=[secret] (file)');
    expect(email).toContain('from="Ekoz <no-reply@localhost>"');
    expect(email).not.toContain('smtp-password');
    expect(email).not.toContain('mailer');
  });

  it('reports the env as source when it overrides the file', async () => {
    const email = section(await summary({ EKOZ_EMAIL__SMTP__HOST: 'relay.env' }), 'email');
    expect(email).toContain('smtp.host=relay.env (env)');
  });

  it('shows an unset secret as unset rather than masked', async () => {
    const storage = section(await summary(), 'storage');
    expect(storage).toContain('s3.secret_access_key=<unset>');
    expect(storage).toContain('driver=local');
  });

  it('shows the database URL without its password nor query string', async () => {
    const lines = await summary();
    expect(section(lines, 'database')).toBe(
      '[database] url=postgres://ekoz:***@db.internal:5432/ekoz (file)',
    );
    expect(section(lines, 'secret')).toBe('[secret] key=[secret] (file)');
    expect(lines.join('\n')).not.toContain('db-password');
    expect(lines.join('\n')).not.toContain(SECRET_KEY);
  });

  it('reports an invalid settings override instead of throwing', async () => {
    const lines = await summary({}, new Map([['registration.mode', 'bogus']]));
    expect(section(lines, 'registration')).toMatch(/^\[registration\] mode=<invalid: /);
  });

  it('renders lists compactly', async () => {
    const avatar = section(
      await summary({ EKOZ_AVATAR__ALLOWED_MIME: 'image/png,image/gif' }),
      'avatar',
    );
    expect(avatar).toContain('allowed_mime=[image/png,image/gif] (env)');
  });
});

describe('redactUrl (unit)', () => {
  it('returns null for something that is not a URL with a host', () => {
    expect(redactUrl('not a url')).toBeNull();
    expect(redactUrl('file:/tmp/db')).toBeNull();
  });

  it('keeps a URL without password intact', () => {
    expect(redactUrl('postgres://db:5432/ekoz')).toBe('postgres://db:5432/ekoz');
  });
});
