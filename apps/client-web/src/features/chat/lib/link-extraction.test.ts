import { describe, expect, it } from 'vitest';

import { extractLinks } from '@/features/chat/lib/link-extraction';

describe('extractLinks', () => {
  it('returns an empty array without a link', () => {
    expect(extractLinks('hello world')).toEqual([]);
  });

  it('extracts a single http(s) link', () => {
    expect(extractLinks('see https://example.test/page')).toEqual(['https://example.test/page']);
  });

  it('extracts several links in order of appearance', () => {
    expect(extractLinks('https://a.test then https://b.test')).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });

  it('deduplicates the same link mentioned twice', () => {
    expect(extractLinks('https://a.test and again https://a.test')).toEqual(['https://a.test']);
  });

  it('trims trailing prose punctuation', () => {
    expect(extractLinks('check https://example.test/page.')).toEqual(['https://example.test/page']);
    expect(extractLinks('(see https://example.test/page)')).toEqual(['https://example.test/page']);
  });

  it('ignores a non-http(s) scheme', () => {
    expect(extractLinks('mailto:jane@example.test')).toEqual([]);
  });

  it('extracts the href of an autolinked markdown link', () => {
    expect(extractLinks('[https://example.test](https://example.test)')).toEqual([
      'https://example.test',
    ]);
  });

  it('extracts several markdown links in order, deduplicated', () => {
    expect(
      extractLinks(
        '[https://a.test](https://a.test) then [https://b.test](https://b.test) then [https://a.test](https://a.test)',
      ),
    ).toEqual(['https://a.test', 'https://b.test']);
  });

  it('extracts a bare url left over once markdown links are matched', () => {
    expect(extractLinks('[a](https://a.test) and https://b.test')).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });
});
