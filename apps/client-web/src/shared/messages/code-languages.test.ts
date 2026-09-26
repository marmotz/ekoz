import { expect, it } from 'vitest';

import { CODE_LANGUAGES, findLanguage, resolveLanguage } from '@/shared/messages/code-languages';

it('turns an alias into its canonical id', () => {
  expect(resolveLanguage('js')).toBe('javascript');
  expect(resolveLanguage('ts')).toBe('typescript');
  expect(resolveLanguage('py')).toBe('python');
  expect(resolveLanguage('sh')).toBe('bash');
  expect(resolveLanguage('yml')).toBe('yaml');
  expect(resolveLanguage('html')).toBe('xml');
});

it('keeps a known id, whatever its case', () => {
  expect(resolveLanguage('rust')).toBe('rust');
  expect(resolveLanguage('Rust')).toBe('rust');
});

it('turns an unknown language, and the plain text names, into text', () => {
  expect(resolveLanguage('klingon')).toBe('text');
  expect(resolveLanguage('text')).toBe('text');
  expect(resolveLanguage('txt')).toBe('text');
});

it('keeps "no language" as null', () => {
  expect(resolveLanguage(null)).toBeNull();
  expect(resolveLanguage(undefined)).toBeNull();
  expect(resolveLanguage('  ')).toBeNull();
});

it('has a unique name for every id and alias', () => {
  const names = CODE_LANGUAGES.flatMap((language) => [language.id, ...language.aliases]);
  expect(new Set(names).size).toBe(names.length);
  expect(findLanguage('c++')?.id).toBe('cpp');
});
