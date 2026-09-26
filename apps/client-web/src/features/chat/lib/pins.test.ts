import { expect, it } from 'vitest';

import { firstLinePreview } from '@/features/chat/lib/pins';

it('keeps a single-line body as is', () => {
  expect(firstLinePreview('hello')).toBe('hello');
});

it('keeps the first line and marks the rest with an ellipsis', () => {
  expect(firstLinePreview('one\ntwo')).toBe('one...');
  expect(firstLinePreview('\n  one  \n\ntwo')).toBe('one...');
});

it('skips a code fence line', () => {
  expect(firstLinePreview('```ts\nconst a = 1;\n```')).toBe('const a = 1;');
});
