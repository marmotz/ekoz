import { expect, it } from 'vitest';

import { initials } from '@/shared/lib/initials';

it.each([
  ['Jane Doe', 'JD'],
  ['jane', 'J'],
  ['Jane Marie Doe', 'JM'],
  ['  ', '?'],
  ['', '?'],
  [undefined, '?'],
  [null, '?'],
])('reads %j as %s', (name, expected) => {
  expect(initials(name)).toBe(expected);
});
