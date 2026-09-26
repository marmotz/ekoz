import { describe, expect, it } from 'vitest';

import { isIdentifierShape } from '@/features/direct-messages/lib/identifier';

describe('isIdentifierShape', () => {
  it.each(['alice/example.test', 'a.b-c/chat.example.org'])('accepts %s', (input) => {
    expect(isIdentifierShape(input)).toBe(true);
  });

  it.each([
    'alice',
    'alice/',
    '/example.test',
    'alice@example.test',
    'alice@example.test/x',
    'alice/example.test/extra',
    'al ice/example.test',
    '',
  ])('rejects %j', (input) => {
    expect(isIdentifierShape(input)).toBe(false);
  });
});
