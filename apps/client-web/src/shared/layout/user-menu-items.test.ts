import { beforeEach, expect, it } from 'vitest';

import {
  clearUserMenuItems,
  getUserMenuItems,
  isComponentItem,
  registerUserMenuItem,
} from '@/shared/layout/user-menu-items';

beforeEach(() => {
  clearUserMenuItems();
});

it('registers entries', () => {
  registerUserMenuItem({ id: 'account', to: '/account', labelKey: 'account.menu' });

  expect(getUserMenuItems().map((item) => item.id)).toEqual(['account']);
});

it('ignores a second registration of the same id', () => {
  registerUserMenuItem({ id: 'account', to: '/account', labelKey: 'account.menu' });
  registerUserMenuItem({ id: 'account', to: '/elsewhere', labelKey: 'account.menu' });

  expect(getUserMenuItems()).toEqual([{ id: 'account', to: '/account', labelKey: 'account.menu' }]);
});

it('orders entries by their order key, unordered ones last', () => {
  registerUserMenuItem({ id: 'last', to: '/last', labelKey: 'account.menu' });
  registerUserMenuItem({ id: 'second', to: '/second', labelKey: 'account.menu', order: 2 });
  registerUserMenuItem({ id: 'first', to: '/first', labelKey: 'account.menu', order: 1 });

  expect(getUserMenuItems().map((item) => item.id)).toEqual(['first', 'second', 'last']);
});

it('registers an entry that renders itself, sorted with the links', () => {
  const Component = () => null;
  registerUserMenuItem({ id: 'link', to: '/link', labelKey: 'account.menu', order: 2 });
  registerUserMenuItem({ id: 'custom', order: 1, Component });

  const items = getUserMenuItems();

  expect(items.map((item) => item.id)).toEqual(['custom', 'link']);
  expect(items.map(isComponentItem)).toEqual([true, false]);
});
