import { render } from '@testing-library/react';
import Markdown from 'react-markdown';
import { expect, it } from 'vitest';

import { markdownOptions, transformUrl } from '@/shared/messages/markdown-allow-list';

function renderMarkdown(source: string) {
  return render(<Markdown {...markdownOptions}>{source}</Markdown>);
}

it('renders the allowed elements', () => {
  const { container } = renderMarkdown(
    '**bold** *em* ~~del~~ `code`\n\n> quote\n\n- a\n- b\n\n1. one\n\n```\nblock\n```',
  );

  for (const selector of ['strong', 'em', 'del', 'code', 'blockquote', 'ul', 'ol', 'li', 'pre']) {
    expect(container.querySelector(selector), selector).not.toBeNull();
  }
});

it('drops raw HTML instead of rendering it', () => {
  const { container } = renderMarkdown(
    'hello <script>alert(1)</script><img src=x onerror=alert(1)>',
  );

  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(container.innerHTML).not.toContain('onerror');
});

it('unwraps disallowed elements and keeps their text', () => {
  const { container } = renderMarkdown('# Title\n\n![alt text](https://example.test/a.png)');

  expect(container.querySelector('h1')).toBeNull();
  expect(container.querySelector('img')).toBeNull();
  expect(container).toHaveTextContent('Title');
});

it('opens links in a new tab without leaking the opener', () => {
  const { getByRole } = renderMarkdown('[site](https://example.test/page)');

  const link = getByRole('link', { name: 'site' });
  expect(link).toHaveAttribute('href', 'https://example.test/page');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
});

it('neutralises a javascript: link', () => {
  const { container } = renderMarkdown('[click](javascript:alert(1))');

  const link = container.querySelector('a');
  expect(link?.getAttribute('href') ?? '').not.toContain('javascript');
});

it('accepts only http, https and mailto URLs', () => {
  expect(transformUrl('http://example.test')).toBe('http://example.test');
  expect(transformUrl('https://example.test')).toBe('https://example.test');
  expect(transformUrl('mailto:jane@example.test')).toBe('mailto:jane@example.test');
  expect(transformUrl('javascript:alert(1)')).toBeNull();
  expect(transformUrl(' javascript:alert(1)')).toBeNull();
  expect(transformUrl('data:text/html,x')).toBeNull();
  expect(transformUrl('/relative/path')).toBeNull();
});

it('highlights a block with a declared language', () => {
  const { container } = renderMarkdown('```ts\nconst a: number = 1;\n```');

  const code = container.querySelector('pre code');
  expect(code).toHaveClass('hljs', 'language-ts');
  expect(code?.querySelector('span.hljs-keyword')).not.toBeNull();
});

it('detects the language of a block without one', () => {
  const { container } = renderMarkdown('```\ndef add(a, b):\n    return a + b\n```');

  const code = container.querySelector('pre code');
  expect(code).toHaveClass('hljs');
  expect(code?.className).toMatch(/language-\w+/);
  expect(code?.querySelector('span[class^="hljs-"]')).not.toBeNull();
});

it('leaves a plain text block unhighlighted', () => {
  const { container } = renderMarkdown('```text\nconst a = 1;\n```');

  const code = container.querySelector('pre code');
  expect(code).not.toHaveClass('hljs');
  expect(code?.querySelector('span')).toBeNull();
});

it('leaves a block with an unknown language unhighlighted', () => {
  const { container } = renderMarkdown('```klingon\nconst a = 1;\n```');

  const code = container.querySelector('pre code');
  expect(code?.querySelector('span')).toBeNull();
});

it('keeps a raw span in a body inert', () => {
  const { container } = renderMarkdown(
    'hello <span class="hljs-keyword" onclick="x()">there</span>',
  );

  expect(container.querySelector('span')).toBeNull();
  expect(container.innerHTML).not.toContain('onclick');
});
