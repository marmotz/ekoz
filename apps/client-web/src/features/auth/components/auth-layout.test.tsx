import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';

import { AuthLayout } from '@/features/auth/components/auth-layout';
import { renderWithProviders } from '../../../../test/render';

vi.mock('@/shared/ui/dropdown-menu', () => import('../../../../test/dropdown-menu-mock'));

it('renders its children in a card, with the language switcher and the theme toggle', async () => {
  renderWithProviders(
    <AuthLayout theme="system" onThemeChange={() => {}}>
      <p>form</p>
    </AuthLayout>,
  );

  expect(await screen.findByText('form')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Language' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Theme' })).toBeInTheDocument();
});

it('has no sidebar or navigation', async () => {
  renderWithProviders(
    <AuthLayout theme="system" onThemeChange={() => {}}>
      <p>form</p>
    </AuthLayout>,
  );

  await screen.findByText('form');
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Open navigation' })).not.toBeInTheDocument();
});

it('reports the picked theme to its caller', async () => {
  const user = userEvent.setup();
  const onThemeChange = vi.fn();
  renderWithProviders(
    <AuthLayout theme="system" onThemeChange={onThemeChange}>
      <p>form</p>
    </AuthLayout>,
  );

  await user.click(await screen.findByRole('menuitem', { name: 'Dark' }));

  expect(onThemeChange).toHaveBeenCalledWith('dark');
});
