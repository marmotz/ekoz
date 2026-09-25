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
