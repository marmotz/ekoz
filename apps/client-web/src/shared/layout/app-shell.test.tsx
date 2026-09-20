import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { AppShell } from '@/shared/layout/app-shell';
import { clearNavRegistry, registerNav } from '@/shared/layout/nav-registry';
import { renderWithProviders } from '../../../test/render';

vi.mock('@/shared/ui/dropdown-menu', () => import('../../../test/dropdown-menu-mock'));

function shell() {
  return (
    <AppShell theme="system" onThemeChange={() => {}}>
      <p>page content</p>
    </AppShell>
  );
}

beforeEach(() => {
  clearNavRegistry();
  registerNav({ id: 'home', to: '/', labelKey: 'nav.home' });
});

it('renders its children in the main area', async () => {
  renderWithProviders(shell());

  expect(within(await screen.findByRole('main')).getByText('page content')).toBeInTheDocument();
});

it('shows the registered navigation in a sidebar hidden below the md breakpoint', async () => {
  renderWithProviders(shell());

  const sidebar = (await screen.findByRole('complementary')) as HTMLElement;
  expect(sidebar).toHaveClass('hidden', 'md:flex');
  expect(within(sidebar).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
});

it('opens the navigation in a sheet from the top bar button below md', async () => {
  renderWithProviders(shell());
  const openButton = await screen.findByRole('button', { name: 'Open navigation' });
  expect(openButton).toHaveClass('md:hidden');

  await userEvent.click(openButton);

  const sheet = await screen.findByRole('dialog');
  const link = within(sheet).getByRole('link', { name: 'Home' });

  await userEvent.click(link);

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('puts the language switcher, the theme toggle and the user menu slot in the top bar', async () => {
  renderWithProviders(
    <AppShell theme="system" onThemeChange={() => {}} userMenu={<button type="button">me</button>}>
      <p>x</p>
    </AppShell>,
  );

  const header = await screen.findByRole('banner');
  expect(within(header).getByRole('button', { name: 'Language' })).toBeInTheDocument();
  expect(within(header).getByRole('button', { name: 'Theme' })).toBeInTheDocument();
  expect(within(header).getByRole('button', { name: 'me' })).toBeInTheDocument();
});
