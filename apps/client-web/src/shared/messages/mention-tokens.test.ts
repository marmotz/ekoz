import { expect, it } from 'vitest';

import { splitOnTokens } from '@/shared/messages/mention-tokens';

const tokens = (...list: string[]) => list.map((token) => ({ token }));

it('returns null when there is nothing to match', () => {
  expect(splitOnTokens('hello', [])).toBeNull();
  expect(splitOnTokens('hello', tokens('@all'))).toBeNull();
});

it('splits the text around the tokens and keeps the index of each target', () => {
  expect(
    splitOnTokens('hi @all and @alice/chat.test!', tokens('@alice/chat.test', '@all')),
  ).toEqual([{ text: 'hi ' }, { mention: 1 }, { text: ' and ' }, { mention: 0 }, { text: '!' }]);
});

it('matches the longest token first', () => {
  expect(splitOnTokens('@design-team', tokens('@design', '@design-team'))).toEqual([
    { mention: 1 },
  ]);
});

it('requires the next character not to continue a name', () => {
  for (const next of ['a', 'z', '0', '_', '.', '-', '/']) {
    expect(splitOnTokens(`@al${next}`, tokens('@al')), next).toBeNull();
  }
  expect(splitOnTokens('@alice', tokens('@al'))).toBeNull();
});

it('accepts other next characters, or the end of the text', () => {
  expect(splitOnTokens('@al', tokens('@al'))).toEqual([{ mention: 0 }]);
  expect(splitOnTokens('@al, @al?', tokens('@al'))).toEqual([
    { mention: 0 },
    { text: ', ' },
    { mention: 0 },
    { text: '?' },
  ]);
});

it('matches exactly, case included', () => {
  expect(splitOnTokens('@ALL', tokens('@all'))).toBeNull();
});

it('keeps the first target when two share a token', () => {
  expect(splitOnTokens('@x', tokens('@x', '@x'))).toEqual([{ mention: 0 }]);
});

it('ignores empty tokens', () => {
  expect(splitOnTokens('abc', tokens(''))).toBeNull();
});
