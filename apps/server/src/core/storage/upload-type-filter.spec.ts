import { describe, expect, it } from 'vitest';
import { isTypeAllowed } from './upload-type-filter.js';

describe('isTypeAllowed', () => {
  it('blocklist: accepts anything not matched', () => {
    expect(isTypeAllowed('image/png', 'blocklist', ['application/zip'])).toBe(true);
  });

  it('blocklist: rejects an exact match', () => {
    expect(isTypeAllowed('application/zip', 'blocklist', ['application/zip'])).toBe(false);
  });

  it('blocklist: rejects a family match', () => {
    expect(isTypeAllowed('video/mp4', 'blocklist', ['video/*'])).toBe(false);
  });

  it('allowlist: rejects anything not matched', () => {
    expect(isTypeAllowed('image/png', 'allowlist', ['application/zip'])).toBe(false);
  });

  it('allowlist: accepts an exact match', () => {
    expect(isTypeAllowed('application/zip', 'allowlist', ['application/zip'])).toBe(true);
  });

  it('allowlist: accepts a family match', () => {
    expect(isTypeAllowed('video/mp4', 'allowlist', ['video/*'])).toBe(true);
  });

  it('a family entry does not match an unrelated type', () => {
    expect(isTypeAllowed('audio/mpeg', 'allowlist', ['video/*'])).toBe(false);
  });
});
