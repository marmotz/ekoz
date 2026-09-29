import { describe, expect, it } from 'vitest';
import { docsLabel, latestProtocolVersion, missingVersions } from '../scripts/version-docs';

describe('docsLabel', () => {
  it('freezes nothing while the version is unreleased or invalid', () => {
    expect(docsLabel('sdk', '0.0.0')).toBeNull();
    expect(docsLabel('sdk', null)).toBeNull();
    expect(docsLabel('protocol', 'next')).toBeNull();
  });

  it('labels the SDK by major.minor', () => {
    expect(docsLabel('sdk', '0.3.2')).toBe('0.3');
    expect(docsLabel('sdk', '1.4.0')).toBe('1.4');
    expect(docsLabel('sdk', '1.4.7')).toBe('1.4');
  });

  it('labels the protocol by major, or 0.minor while the major is 0', () => {
    expect(docsLabel('protocol', '0.2.0')).toBe('0.2');
    expect(docsLabel('protocol', '1.3.0')).toBe('1');
    expect(docsLabel('protocol', '2.0.1')).toBe('2');
  });
});

describe('latestProtocolVersion', () => {
  it('ignores Unreleased and picks the first released heading', () => {
    const changelog =
      '# Changelog\n\n## [Unreleased]\n\n- x\n\n## [0.2.0] - 2026-01-01\n\n## [0.1.0]\n';
    expect(latestProtocolVersion(changelog)).toBe('0.2.0');
  });

  it('returns null when nothing is released', () => {
    expect(latestProtocolVersion('## [Unreleased]\n')).toBeNull();
  });
});

describe('repository state', () => {
  it("has every released version frozen (run 'bun run docs:version' otherwise)", () => {
    expect(missingVersions()).toEqual([]);
  });
});
