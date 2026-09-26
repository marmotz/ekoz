import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';

import { UserMenu } from '@/features/auth/components/user-menu';
import { clearUserMenuItems, registerUserMenuItem } from '@/shared/layout/user-menu-items';
import { avatarColors } from '@/shared/lib/avatar-color';
import { SdkProvider } from '@/shared/sdk/provider';
import { renderWithProviders } from '../../../../test/render';
import { createClientMock, createFakeSdk, defaultMe } from '../../../../test/sdk-mock';

vi.mock('@ekozhq/sdk', async (importOriginal) =>
  (await import('../../../../test/sdk-mock')).mockSdkModule(await importOriginal()),
);
vi.mock('@/shared/ui/popover', () => import('../../../../test/popover-mock'));
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

it('makes the user appear away before signing out', async () => {
  const user = userEvent.setup();
  const fake = createFakeSdk(signedIn);
  const order: string[] = [];
  fake.reporterControl.reporter.signOff.mockImplementation(async () => {
    order.push('signOff');
  });
  fake.stubs.auth.logout.mockImplementation(async () => {
    order.push('logout');
  });
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(menu());
  await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));

  await waitFor(() => expect(order).toEqual(['signOff', 'logout']));
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
  expect(items.map((item) => item.textContent?.trim())).toEqual([
    'My public profile',
    'Account',
    'Account',
    'Sign out',
  ]);
  expect(items[1]).toHaveAttribute('href', '/account');
  expect(items[2]).toHaveAttribute('href', '/settings');
});

it('shows no entry but the profile and "Sign out" when none is registered', async () => {
  createClientMock.mockReturnValue(createFakeSdk(signedIn).sdk);

  renderWithProviders(menu());

  const items = await screen.findAllByRole('menuitem');
  expect(items.map((item) => item.textContent?.trim())).toEqual(['My public profile', 'Sign out']);
});

it('opens the public profile card of the account from "My public profile"', async () => {
  const user = userEvent.setup();
  const fake = createFakeSdk(signedIn);
  fake.stubs.me.get.mockResolvedValue({
    ...(await fake.stubs.me.get()),
    bio: 'about me',
  });
  fake.stubs.users.getProfile.mockResolvedValue({
    identifier: 'jane/example.test',
    displayName: 'Jane Doe',
    bio: 'about me',
    avatarUrl: null,
  } as never);
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(menu());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(await screen.findByRole('menuitem', { name: 'My public profile' }));

  const card = await screen.findByRole('dialog');
  expect(await within(card).findByText('about me')).toBeInTheDocument();
  expect(within(card).getByText('jane/example.test')).toBeInTheDocument();
  expect(within(card).getByText('Jane Doe')).toBeInTheDocument();
  expect(fake.stubs.users.getProfile).toHaveBeenCalledWith('jane/example.test');
});

it('offers no profile entry when the account could not be loaded', async () => {
  const fake = createFakeSdk(signedIn);
  fake.stubs.me.get.mockRejectedValue(new Error('offline'));
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(menu());

  expect(await screen.findByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'My public profile' })).not.toBeInTheDocument();
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

it('colors the avatar like the same account elsewhere, from the account id', async () => {
  createClientMock.mockReturnValue(createFakeSdk(signedIn).sdk);

  renderWithProviders(menu());

  const button = await screen.findByRole('button', { name: 'Account menu' });
  const disc = within(button).getByText('JD');
  // jsdom normalizes colors, so compare with the expected value written the same way.
  const expected = document.createElement('span');
  expected.style.background = avatarColors(defaultMe.id).background;
  expect(disc.style.background).toBe(expected.style.background);
});

it('renders a component entry as is, among the links', async () => {
  registerUserMenuItem({
    id: 'custom',
    order: 1,
    Component: () => (
      <button type="button" role="menuitem">
        Custom entry
      </button>
    ),
  });
  registerUserMenuItem({ id: 'account', to: '/account', labelKey: 'account.title', order: 2 });
  createClientMock.mockReturnValue(createFakeSdk(signedIn).sdk);

  renderWithProviders(menu());

  const items = await screen.findAllByRole('menuitem');
  expect(items.map((item) => item.textContent?.trim())).toEqual([
    'My public profile',
    'Custom entry',
    'Account',
    'Sign out',
  ]);
});

it('shows the own presence dot on the trigger once the heartbeat has answered', async () => {
  const fake = createFakeSdk(signedIn);
  createClientMock.mockReturnValue(fake.sdk);

  renderWithProviders(menu());
  const trigger = await screen.findByRole('button', { name: 'Account menu' });
  expect(within(trigger).queryByRole('img', { name: 'Online' })).not.toBeInTheDocument();

  act(() => fake.reporterControl.setState({ status: 'online', manualAway: false }));
  expect(await within(trigger).findByRole('img', { name: 'Online' })).toBeInTheDocument();

  act(() => fake.reporterControl.setState({ status: 'away', manualAway: true }));
  expect(await within(trigger).findByRole('img', { name: 'Away' })).toBeInTheDocument();
});
