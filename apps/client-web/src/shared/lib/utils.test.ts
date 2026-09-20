import { expect, it } from 'vitest';

import { cn } from '@/shared/lib/utils';

it('merges conflicting Tailwind classes, the last one winning', () => {
  expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4');
});

it('drops falsy values', () => {
  const hidden: boolean = false as boolean;
  expect(cn('a', hidden && 'b', undefined, 'c')).toBe('a c');
});
