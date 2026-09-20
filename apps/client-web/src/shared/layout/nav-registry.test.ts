import { beforeEach, expect, it } from 'vitest';

import { clearNavRegistry, getNavEntries, registerNav } from '@/shared/layout/nav-registry';

beforeEach(() => {
  clearNavRegistry();
});

it('registers entries', () => {
  registerNav({ id: 'home', to: '/', labelKey: 'nav.home' });

  expect(getNavEntries().map((entry) => entry.id)).toEqual(['home']);
});

it('ignores a second registration of the same id', () => {
  registerNav({ id: 'home', to: '/', labelKey: 'nav.home' });
  registerNav({ id: 'home', to: '/elsewhere', labelKey: 'nav.home' });

  expect(getNavEntries()).toEqual([{ id: 'home', to: '/', labelKey: 'nav.home' }]);
});

it('orders entries by their order key, unordered ones last', () => {
  registerNav({ id: 'last', to: '/last', labelKey: 'nav.home' });
  registerNav({ id: 'second', to: '/second', labelKey: 'nav.home', order: 2 });
  registerNav({ id: 'first', to: '/first', labelKey: 'nav.home', order: 1 });

  expect(getNavEntries().map((entry) => entry.id)).toEqual(['first', 'second', 'last']);
});
