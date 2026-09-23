import { createFileRoute } from '@tanstack/react-router';
import { UserRound } from 'lucide-react';

import { AccountPage } from '@/features/profile/routes/account-page';
import { registerUserMenuItem } from '@/shared/layout/user-menu-items';

registerUserMenuItem({
  id: 'account',
  to: '/account',
  labelKey: 'account.menu',
  icon: UserRound,
  order: 0,
});

export const Route = createFileRoute('/_app/account')({
  staticData: { title: 'account.title' },
  component: AccountPage,
});
