import { describe, expect, it } from 'vitest';
import { RestrictedMarkdownError, validateRestrictedMarkdown } from './restricted-markdown.js';

describe('restricted markdown (unit)', () => {
  it('accepts the allowed constructs', () => {
    const source = [
      '**bold** _em_ ~~strike~~ `code`',
      '',
      '> quote',
      '',
      '- one',
      '- two',
      '',
      '[a link](https://example.com) and [mail](mailto:a@b.co)',
      '',
      '```',
      'fenced',
      '```',
    ].join('\n');

    expect(() => validateRestrictedMarkdown(source)).not.toThrow();
  });

  it('rejects raw HTML', () => {
    expect(() => validateRestrictedMarkdown('hi <script>alert(1)</script>')).toThrow(
      RestrictedMarkdownError,
    );
  });

  it('rejects images', () => {
    expect(() => validateRestrictedMarkdown('![alt](https://example.com/x.png)')).toThrow(
      RestrictedMarkdownError,
    );
  });

  it('rejects headings', () => {
    expect(() => validateRestrictedMarkdown('# heading')).toThrow(RestrictedMarkdownError);
  });

  it('rejects tables', () => {
    const source = ['| a | b |', '| - | - |', '| 1 | 2 |'].join('\n');
    expect(() => validateRestrictedMarkdown(source)).toThrow(RestrictedMarkdownError);
  });

  it('rejects a non-http(s)/mailto link scheme', () => {
    expect(() => validateRestrictedMarkdown('[bad](javascript:alert(1))')).toThrow(
      RestrictedMarkdownError,
    );
  });
});
