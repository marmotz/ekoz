import { expect, it } from 'vitest';

import { Route } from '@/routes/_app/account';
import { getUserMenuItems } from '@/shared/layout/user-menu-items';

it('registers the Account user menu entry', () => {
  expect(getUserMenuItems()).toContainEqual(
    expect.objectContaining({ id: 'account', to: '/account', labelKey: 'account.menu' }),
  );
});

it('titles the page and renders the account page', () => {
  expect(Route.options.staticData?.title).toBe('account.title');
  expect(Route.options.component).toBeDefined();
});
