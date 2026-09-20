import { describe, expect, it } from 'vitest';

import { pickSupportedLanguage } from '@/server/language';

describe('pickSupportedLanguage', () => {
  it('picks French for Accept-Language: fr', () => {
    expect(pickSupportedLanguage('fr')).toBe('fr');
  });

  it('honours the header order and ignores quality values and regions', () => {
    expect(pickSupportedLanguage('fr-FR,fr;q=0.9,en;q=0.8')).toBe('fr');
    expect(pickSupportedLanguage('de,en-US;q=0.7')).toBe('en');
  });

  it('falls back to English for unsupported languages', () => {
    expect(pickSupportedLanguage('de,es;q=0.8')).toBe('en');
  });

  it('falls back to English when the header is absent or empty', () => {
    expect(pickSupportedLanguage(undefined)).toBe('en');
    expect(pickSupportedLanguage('')).toBe('en');
  });
});
