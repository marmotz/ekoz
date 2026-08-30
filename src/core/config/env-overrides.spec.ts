import { describe, expect, it } from 'vitest';
import { readEnvOverrides } from './env-overrides.js';

describe('env overrides (unit)', () => {
  it('maps EKOZ_<SECTION>__<KEY> to a dotted registry key', () => {
    const out = readEnvOverrides({ EKOZ_SERVER__DOMAIN: 'a.test', EKOZ_HTTP__PORT: '9000' });
    expect(out.get('server.domain')).toBe('a.test');
    expect(out.get('http.port')).toBe('9000');
  });

  it('handles a three-segment key with two double underscores', () => {
    const out = readEnvOverrides({ EKOZ_STORAGE__LOCAL__PATH: '/data/blobs' });
    expect(out.get('storage.local.path')).toBe('/data/blobs');
  });

  it('ignores EKOZ_ variables that are not registry keys', () => {
    const out = readEnvOverrides({ EKOZ_UNKNOWN__THING: 'x', NOT_EKOZ: 'y' });
    expect(out.size).toBe(0);
  });
});
