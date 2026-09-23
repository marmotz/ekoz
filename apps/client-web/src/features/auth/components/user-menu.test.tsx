import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { UserMenu } from '@/features/auth/components/user-menu';
import { clearUserMenuItems, registerUserMenuItem } from '@/shared/layout/user-menu-items';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);
vi.mock('@/shared/ui/dropdown-menu', () => import('../../../../test/dropdown-menu-mock'));

const signedIn = { identifier: null, sessionId: 's1' };

function menu() {
  return (
    <SdkProvider>
      <UserMenu />
    </SdkProvider>
  );
}

beforeEach(() => {
  createClientMock.mockReset();
  clearUserMenuItems();
});

it('shows the display name and its initials', async () => {
  const fake = createFakeSdk(signedIn);
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(menu());

  expect(await screen.findByRole('button', { name: 'Account menu' })).toHaveTextContent('JD');
  expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
  expect(fake.stubs.me.get).toHaveBeenCalledTimes(1);
});

it('shows a skeleton while the account is loading', async () => {
  const fake = createFakeSdk(signedIn);
  fake.stubs.me.get.mockReturnValue(new Promise(() => {}));
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(menu());

  expect(await screen.findByTestId('user-menu-skeleton')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument();
});

it('signs out through the SDK, once, without navigating itself', async () => {
  const user = userEvent.setup();
  const fake = createFakeSdk(signedIn);
  createClientMock.mockReturnValue(fake.sdk);

  const { router } = renderWithProviders(menu(), { route: '/somewhere' });
  await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

  expect(fake.stubs.auth.logout).toHaveBeenCalledTimes(1);
  expect(router.state.location.pathname).toBe('/somewhere');
});

it('renders nothing and requests nothing for an anonymous session', async () => {
  const fake = createFakeSdk();
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(menu());

  await waitFor(() => expect(fake.stubs.session.resume).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByTestId('user-menu-skeleton')).not.toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument();
  expect(fake.stubs.me.get).not.toHaveBeenCalled();
});

it('still offers to sign out when the account could not be loaded', async () => {
  const fake = createFakeSdk(signedIn);
  fake.stubs.me.get.mockRejectedValue(new Error('offline'));
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(menu());

  expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Account menu' })).toHaveTextContent('?');
});

it('shows French labels', async () => {
  createClientMock.mockReturnValue(createFakeSdk(signedIn).sdk);

  renderWithProviders(menu(), { language: 'fr' });

  expect(await screen.findByRole('menuitem', { name: 'Se déconnecter' })).toBeInTheDocument();
});

it('lists the registered entries above "Sign out", in order, as links', async () => {
  registerUserMenuItem({ id: 'settings', to: '/settings', labelKey: 'account.menu', order: 2 });
  registerUserMenuItem({ id: 'account', to: '/account', labelKey: 'account.title', order: 1 });
  createClientMock.mockReturnValue(createFakeSdk(signedIn).sdk);

  renderWithProviders(menu());

  const items = await screen.findAllByRole('menuitem');
  expect(items.map((item) => item.textContent?.trim())).toEqual(['Account', 'Account', 'Sign out']);
  expect(items[0]).toHaveAttribute('href', '/account');
  expect(items[1]).toHaveAttribute('href', '/settings');
});

it('shows no entry but "Sign out" when none is registered', async () => {
  createClientMock.mockReturnValue(createFakeSdk(signedIn).sdk);

  renderWithProviders(menu());

  expect(await screen.findAllByRole('menuitem')).toHaveLength(1);
});

it('shows the avatar of the account, fetched with its versioned url', async () => {
  const fake = createFakeSdk(signedIn);
  fake.stubs.me.get.mockResolvedValue({
    ...(await fake.stubs.me.get()),
    avatarUrl: 'http://localhost:3010/users/jane/avatar?v=3',
  });
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(menu());

  await waitFor(() =>
    expect(fake.stubs.users.avatar).toHaveBeenCalledWith('jane/example.test', { version: '3' }),
  );
});
