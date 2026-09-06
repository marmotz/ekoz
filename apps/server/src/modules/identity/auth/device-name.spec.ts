import { describe, expect, it } from 'vitest';
import { deriveDeviceName } from './device-name.js';

describe('deriveDeviceName (unit)', () => {
  it('falls back for an empty / missing UA', () => {
    expect(deriveDeviceName(undefined)).toBe('Unknown device');
    expect(deriveDeviceName('   ')).toBe('Unknown device');
  });

  it('names browser + OS', () => {
    expect(
      deriveDeviceName(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
      )
    ).toBe('Chrome on Windows');
    expect(deriveDeviceName('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/121.0')).toBe('Firefox on macOS');
  });

  it('recognises the native app and curl', () => {
    expect(deriveDeviceName('EkozApp/1.2 (iPhone; iOS 17)')).toBe('Ekoz app on iOS');
    expect(deriveDeviceName('curl/8.4.0')).toBe('curl');
  });
});
