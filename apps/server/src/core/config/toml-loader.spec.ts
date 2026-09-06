import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenTomlObject, loadTomlConfig } from './toml-loader.js';

describe('TOML loader (unit)', () => {
  it('flattens nested tables to dotted keys', () => {
    const flat = flattenTomlObject(
      { server: { domain: 'x.test' }, storage: { local: { path: '/b' } } },
      {},
    );
    expect(flat.get('server.domain')).toBe('x.test');
    expect(flat.get('storage.local.path')).toBe('/b');
  });

  it('interpolates ${ENV_VAR} in string values', () => {
    const flat = flattenTomlObject(
      { database: { url: 'postgres://${DB_HOST}/db' } },
      { DB_HOST: 'db.internal' },
    );
    expect(flat.get('database.url')).toBe('postgres://db.internal/db');
  });

  it('throws when an interpolated variable is missing', () => {
    expect(() => flattenTomlObject({ a: { b: '${NOPE}' } }, {})).toThrow(/NOPE/);
  });

  it('returns an empty map when the file does not exist', () => {
    expect(loadTomlConfig(join(tmpdir(), 'does-not-exist-ekoz.toml')).size).toBe(0);
  });

  it('reads a real file from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ekoz-toml-'));
    const file = join(dir, 'config.toml');
    writeFileSync(file, '[http]\nport = 8080\n');
    expect(loadTomlConfig(file).get('http.port')).toBe(8080);
  });
});
